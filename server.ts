import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp as initFirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  disableNetwork,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  setLogLevel,
} from 'firebase/firestore';

dotenv.config();

try {
  setLogLevel('silent');
} catch {
  // ignore
}

const FIREBASE_CFG_PATH = path.join(process.cwd(), 'firebase-applet-config.json');
let firestoreDb: ReturnType<typeof getFirestore> | null = null;
let serverFirestoreQuotaExhausted = false;
const serverWrittenFingerprints = new Map<string, string>();
let lastCloudPullAt = 0;
let cachedCloudUsers: Record<string, Record<string, unknown>> = {};

try {
  if (fs.existsSync(FIREBASE_CFG_PATH)) {
    const fbCfg = JSON.parse(fs.readFileSync(FIREBASE_CFG_PATH, 'utf-8'));
    if (fbCfg && fbCfg.projectId) {
      const fbApp = initFirebaseApp(fbCfg, 'server-sync');
      firestoreDb = getFirestore(fbApp, fbCfg.firestoreDatabaseId);
    }
  }
} catch (err) {
  console.error('Could not initialize Firestore in server.ts:', err);
}

function isServerFirestoreQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const code = (err as { code?: string })?.code || '';
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('maximum backoff delay')
  );
}

function tripServerFirestoreCircuitBreaker() {
  if (!serverFirestoreQuotaExhausted) {
    serverFirestoreQuotaExhausted = true;
    if (firestoreDb) {
      disableNetwork(firestoreDb).catch(() => {});
    }
  }
}

function withServerFirestoreTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('firestore-timeout'));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function emailToFirestoreDocId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_\-@.+]/g, '_')
    .slice(0, 240);
}

function extractBestPhone(rawUser: Record<string, unknown>): string {
  if (typeof rawUser.phone === 'string' && rawUser.phone.trim()) {
    return rawUser.phone.trim();
  }
  const pending = rawUser.pendingPayment as Record<string, unknown> | undefined;
  if (pending && typeof pending.senderPhone === 'string' && pending.senderPhone.trim()) {
    return pending.senderPhone.trim();
  }
  if (Array.isArray(rawUser.paymentHistory)) {
    for (const ph of rawUser.paymentHistory) {
      const pObj = ph as Record<string, unknown>;
      if (pObj && typeof pObj.senderPhone === 'string' && pObj.senderPhone.trim()) {
        return pObj.senderPhone.trim();
      }
    }
  }
  return '';
}

function assignServerCustomerNumbers(
  users: Record<string, Record<string, unknown>>
): Record<string, Record<string, unknown>> {
  const entries = Object.entries(users || {}).filter(
    ([k, v]) => k && v && typeof v === 'object'
  );
  entries.sort(([, a], [, b]) => {
    const aFirst = Number(a.firstEntryAt || a.createdAt || Number.MAX_SAFE_INTEGER);
    const bFirst = Number(b.firstEntryAt || b.createdAt || Number.MAX_SAFE_INTEGER);
    if (aFirst !== bFirst) return aFirst - bFirst;
    return String(a.email || '').localeCompare(String(b.email || ''));
  });
  const result: Record<string, Record<string, unknown>> = {};
  entries.forEach(([k, u], idx) => {
    const emailClean = String(u.email || k).trim().toLowerCase();
    const firstMs =
      Number(u.firstEntryAt) > 0
        ? Number(u.firstEntryAt)
        : Number(u.createdAt) > 0
        ? Number(u.createdAt)
        : Date.now();
    result[emailClean] = {
      ...u,
      email: emailClean,
      customerNumber: idx + 1,
      firstEntryAt: firstMs,
      createdAt: firstMs,
      phone: extractBestPhone(u),
    };
  });
  return result;
}

function computeServerUserFingerprint(u: Record<string, unknown>): string {
  const periods = Array.isArray(u.periods) ? u.periods : [];
  const appointments = Array.isArray(u.appointments) ? u.appointments : [];
  const therapyLogs = Array.isArray(u.therapyLogs) ? u.therapyLogs : [];
  const dailyLogs = u.dailyLogs && typeof u.dailyLogs === 'object' ? Object.keys(u.dailyLogs) : [];
  return JSON.stringify({
    email: u.email,
    name: u.name,
    age: u.age || '',
    phone: u.phone || '',
    password: u.password || '',
    role: u.role || 'client',
    customerNumber: u.customerNumber || 0,
    firstEntryAt: u.firstEntryAt || u.createdAt || 0,
    subscriptionStatus: u.subscriptionStatus || 'active',
    subscriptionUntil: u.subscriptionUntil || 0,
    periodsLen: periods.length,
    lastPeriod: periods.length > 0 ? periods[periods.length - 1] : null,
    appointmentsLen: appointments.length,
    lastAppointment: appointments.length > 0 ? appointments[0] : null,
    therapyLogsLen: therapyLogs.length,
    lastTherapyLog: therapyLogs.length > 0 ? therapyLogs[0] : null,
    skincareGoal: u.skincareGoal || '',
    dailyLogsLen: dailyLogs.length,
    welcomeMessageSent: Boolean(u.welcomeMessageSent),
    paymentAppreciationPending: Boolean(u.paymentAppreciationPending),
  });
}

async function pushUsersToCloudFirestore(users: Record<string, Record<string, unknown>>) {
  if (!firestoreDb || serverFirestoreQuotaExhausted) return;
  const numbered = assignServerCustomerNumbers(users);
  for (const [k, rawUser] of Object.entries(numbered)) {
    if (serverFirestoreQuotaExhausted) break;
    if (!rawUser || typeof rawUser !== 'object') continue;
    const emailClean = String(rawUser.email || k)
      .trim()
      .toLowerCase()
      .slice(0, 254);
    if (!emailClean || emailClean.length < 3) continue;
    const nameClean = String(rawUser.name || emailClean.split('@')[0] || 'Student')
      .trim()
      .slice(0, 200);
    const docId = emailToFirestoreDocId(emailClean);
    const firstMs =
      Number(rawUser.firstEntryAt) > 0
        ? Number(rawUser.firstEntryAt)
        : Number(rawUser.createdAt) > 0
        ? Number(rawUser.createdAt)
        : Date.now();
    const phoneUsed = extractBestPhone(rawUser).slice(0, 60);
    const cleaned = JSON.parse(
      JSON.stringify({
        ...rawUser,
        email: emailClean,
        name: nameClean || 'Student',
        age: String(rawUser.age || '').trim().slice(0, 20),
        phone: phoneUsed,
        password: String(rawUser.password || '').trim().slice(0, 200),
        firstEntryAt: firstMs,
        createdAt: firstMs,
        lastUpdatedAt: rawUser.lastUpdatedAt || new Date().toISOString(),
      })
    );
    const fingerprint = computeServerUserFingerprint(cleaned);
    if (serverWrittenFingerprints.get(docId) === fingerprint) {
      continue;
    }
    try {
      await withServerFirestoreTimeout(
        setDoc(doc(firestoreDb, 'bloomcampus_users', docId), cleaned, { merge: true })
      );
      serverWrittenFingerprints.set(docId, fingerprint);
    } catch (err) {
      if (isServerFirestoreQuotaError(err)) {
        tripServerFirestoreCircuitBreaker();
        break;
      }
    }
  }
}

async function pullUsersFromCloudFirestore(
  deletedEmails: Record<string, number> = {}
): Promise<Record<string, Record<string, unknown>>> {
  if (!firestoreDb || serverFirestoreQuotaExhausted) {
    const filteredCached: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(cachedCloudUsers)) {
      if (!deletedEmails[k.toLowerCase().trim()]) {
        filteredCached[k] = v;
      }
    }
    return filteredCached;
  }
  if (Date.now() - lastCloudPullAt < 2_000 && Object.keys(cachedCloudUsers).length > 0) {
    const filteredCached: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(cachedCloudUsers)) {
      if (!deletedEmails[k.toLowerCase().trim()]) {
        filteredCached[k] = v;
      }
    }
    return filteredCached;
  }
  const out: Record<string, Record<string, unknown>> = {};
  try {
    const snap = await withServerFirestoreTimeout(
      getDocs(collection(firestoreDb, 'bloomcampus_users'))
    );
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data && typeof data.email === 'string') {
        const emailClean = data.email.trim().toLowerCase();
        if (deletedEmails[emailClean]) return;
        out[emailClean] = sanitizeUserRecord(data, emailClean);
      }
    });
  } catch (err) {
    if (isServerFirestoreQuotaError(err)) {
      tripServerFirestoreCircuitBreaker();
      return cachedCloudUsers;
    }
  }
  try {
    const entriesSnap = await withServerFirestoreTimeout(
      getDocs(collection(firestoreDb, 'bloomcampus_entries'))
    );
    entriesSnap.forEach((d) => {
      const entry = d.data() as Record<string, unknown>;
      if (entry && typeof entry.email === 'string') {
        const emailClean = entry.email.trim().toLowerCase();
        if (deletedEmails[emailClean]) return;
        const existing = out[emailClean];
        const firstTs = Number(entry.firstEntryAt || entry.timestamp || Date.now());
        const entryIso = String(
          entry.timestampIso ||
            (entry.timestamp ? new Date(Number(entry.timestamp)).toISOString() : new Date().toISOString())
        );
        if (!existing) {
          out[emailClean] = sanitizeUserRecord(
            {
              name: String(entry.name || emailClean.split('@')[0] || 'Student'),
              age: String(entry.age || ''),
              email: emailClean,
              phone: String(entry.phone || ''),
              password: String(entry.password || ''),
              firstEntryAt: firstTs,
              createdAt: firstTs,
              lastUpdatedAt: entryIso,
              lastSignInAt: entryIso,
              signInCount: 1,
              signupSource: String(entry.entryType || 'Sign In'),
              deviceInfo: String(entry.deviceInfo || 'WebApp Link'),
              isVip: false,
              usedFreeAccessPassword: false,
              subscriptionStatus: 'active',
              subscriptionUntil: firstTs + 14 * 24 * 60 * 60 * 1000,
              paymentMethod: '2-Week Free Access',
              periods: [],
              emergencyPills: [],
              dailyLogs: {},
            },
            emailClean
          );
        } else {
          const existingSignInMs = existing.lastSignInAt
            ? new Date(String(existing.lastSignInAt)).getTime()
            : 0;
          const entryTsMs = Number(entry.timestamp) || new Date(entryIso).getTime() || 0;
          out[emailClean] = sanitizeUserRecord(
            {
              ...existing,
              name: String(existing.name || entry.name || 'Student'),
              age: String(existing.age || entry.age || ''),
              phone: extractBestPhone(existing) || String(entry.phone || ''),
              password: String(existing.password || entry.password || ''),
              firstEntryAt: Math.min(
                Number(existing.firstEntryAt || existing.createdAt || firstTs),
                firstTs
              ),
              createdAt: Math.min(
                Number(existing.firstEntryAt || existing.createdAt || firstTs),
                firstTs
              ),
              deviceInfo: String(entry.deviceInfo || existing.deviceInfo || 'WebApp Link'),
              lastSignInAt:
                entryTsMs > existingSignInMs
                  ? entryIso
                  : String(existing.lastSignInAt || entryIso),
              lastUpdatedAt:
                entryTsMs >
                (existing.lastUpdatedAt ? new Date(String(existing.lastUpdatedAt)).getTime() : 0)
                  ? entryIso
                  : String(existing.lastUpdatedAt || entryIso),
            },
            emailClean
          );
        }
      }
    });
  } catch (err) {
    if (isServerFirestoreQuotaError(err)) {
      tripServerFirestoreCircuitBreaker();
    }
  }
  lastCloudPullAt = Date.now();
  cachedCloudUsers = out;
  return assignServerCustomerNumbers(out);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface CommunityComment {
  id: string;
  userName: string;
  commentText: string;
  stageTag?: string;
  treatmentTag?: string;
  createdAt: string;
}

const DEFAULT_COMMENTS: CommunityComment[] = [
  {
    id: 'c-1',
    userName: 'Kumba Hannah K.',
    commentText: 'Syncing my heavy study sessions to my Follicular stage made such a difference for my midterms! Also loved my hydrating facial session at Sidratu on Jomo Kenyatta Road.',
    stageTag: 'Follicular Stage',
    treatmentTag: 'Facial Treatment',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'c-2',
    userName: 'Mariama S.',
    commentText: 'The 2-day bag alert saved me right before my morning lecture on campus. Remember to pack dark chocolate and water!',
    stageTag: 'Luteal Stage',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'c-3',
    userName: 'Aminata B.',
    commentText: 'Booked an Anti-Dark Spot consultation at Sidratu Beauty Therapy Skin Care after hormonal breakouts during my Luteal phase. The staff were so welcoming and empathetic!',
    stageTag: 'Menstruation Stage',
    treatmentTag: 'Anti-Dark Spot Treatment',
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
];

const PROJECT_DATA_DIR = path.join(process.cwd(), '.data');
const TMP_DATA_DIR = path.join(os.tmpdir(), 'bloomcampus_data');
const PROJECT_STORE_PATH = path.join(PROJECT_DATA_DIR, 'bloomcampus_store.json');
const TMP_STORE_PATH = path.join(TMP_DATA_DIR, 'bloomcampus_store.json');

interface PersistentStore {
  users: Record<string, Record<string, unknown>>;
  deletedEmails: Record<string, number>;
  communityComments: CommunityComment[];
  adminConfig: {
    ownerEmail: string;
    adminPassword: string;
    freeAccessPassword: string;
    additionalAdmins?: Array<{
      email: string;
      password: string;
      name?: string;
      addedAt: string;
    }>;
    updatedAt: string;
  };
  supportInquiries: Array<{
    id: string;
    userName: string;
    userEmail: string;
    userPhone?: string;
    userAge?: string;
    deviceInfo?: string;
    subject: string;
    message: string;
    type: 'payment' | 'support' | 'login' | 'signup' | 'welcome' | 'appreciation';
    createdAt: string;
  }>;
}

const DEFAULT_ADMIN_CFG = {
  ownerEmail: 'abdulbobsonbaituray@gmail.com',
  adminPassword: '@Haizen565.',
  freeAccessPassword: 'Bobson@565',
  additionalAdmins: [],
  updatedAt: new Date().toISOString(),
};

function sanitizeUserRecord(obj: Record<string, unknown>, emailKey: string): Record<string, unknown> {
  const firstMs =
    Number(obj.firstEntryAt) > 0
      ? Number(obj.firstEntryAt)
      : Number(obj.createdAt) > 0
      ? Number(obj.createdAt)
      : Date.now();
  const cleaned: Record<string, unknown> = {
    ...obj,
    email: emailKey,
    firstEntryAt: firstMs,
    createdAt: firstMs,
    phone: extractBestPhone(obj),
  };
  if (typeof cleaned.paymentMethod === 'string') {
    if (cleaned.paymentMethod.includes('Bobson')) {
      cleaned.paymentMethod = '2-Week Free Access';
    }
  }
  return cleaned;
}

function getSafeTimestamp(obj: Record<string, unknown>): number {
  if (obj.lastUpdatedAt) {
    const t = new Date(String(obj.lastUpdatedAt)).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  const c = Number(obj.createdAt || 0);
  return !isNaN(c) && c > 0 ? c : 0;
}

function mergeUserRecords(
  existingUsers: Record<string, Record<string, unknown>>,
  incomingUsers: Record<string, unknown>,
  deletedEmails: Record<string, number> = {}
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {};
  Object.entries(existingUsers || {}).forEach(([k, v]) => {
    if (!k || !v || typeof v !== 'object') return;
    const emailKey = String((v as Record<string, unknown>).email || k)
      .toLowerCase()
      .trim();
    if (emailKey && !deletedEmails[emailKey]) {
      merged[emailKey] = sanitizeUserRecord(v as Record<string, unknown>, emailKey);
    }
  });

  Object.entries(incomingUsers || {}).forEach(([rawKey, val]) => {
    if (!rawKey || !val || typeof val !== 'object') return;
    const incomingObj = val as Record<string, unknown>;
    const emailKey = String(incomingObj.email || rawKey)
      .toLowerCase()
      .trim();
    if (!emailKey || deletedEmails[emailKey]) return;
    const currentObj = merged[emailKey];
    if (!currentObj) {
      merged[emailKey] = sanitizeUserRecord(incomingObj, emailKey);
      return;
    }
    const currUpdated = getSafeTimestamp(currentObj);
    const incUpdated = getSafeTimestamp(incomingObj);
    const base = incUpdated >= currUpdated ? { ...currentObj, ...incomingObj } : { ...incomingObj, ...currentObj };

    // Always preserve non-empty name, age, phone (number used), and password, and earliest firstEntryAt
    const currFirst = Number(currentObj.firstEntryAt || currentObj.createdAt || Date.now());
    const incFirst = Number(incomingObj.firstEntryAt || incomingObj.createdAt || Date.now());
    const earliestFirst = Math.min(
      currFirst > 0 ? currFirst : Date.now(),
      incFirst > 0 ? incFirst : Date.now()
    );
    const bestPhone =
      (incUpdated >= currUpdated ? extractBestPhone(incomingObj) : '') ||
      extractBestPhone(currentObj) ||
      extractBestPhone(incomingObj);
    const bestAge =
      (incUpdated >= currUpdated && String(incomingObj.age || '').trim()
        ? String(incomingObj.age).trim()
        : '') ||
      String(currentObj.age || '').trim() ||
      String(incomingObj.age || '').trim();
    const bestPassword =
      (incUpdated >= currUpdated && String(incomingObj.password || '').trim()
        ? String(incomingObj.password).trim()
        : '') ||
      String(currentObj.password || '').trim() ||
      String(incomingObj.password || '').trim();
    const bestName =
      (incUpdated >= currUpdated &&
      String(incomingObj.name || '').trim() &&
      String(incomingObj.name).trim() !== emailKey.split('@')[0]
        ? String(incomingObj.name).trim()
        : '') ||
      (String(currentObj.name || '').trim() &&
      String(currentObj.name).trim() !== emailKey.split('@')[0]
        ? String(currentObj.name).trim()
        : '') ||
      String(incomingObj.name || currentObj.name || emailKey.split('@')[0] || 'Student').trim();

    const currAppts = Array.isArray(currentObj.appointments) ? currentObj.appointments : [];
    const incAppts = Array.isArray(incomingObj.appointments) ? incomingObj.appointments : [];
    const apptMap = new Map<string, unknown>();
    [...currAppts, ...incAppts].forEach((a: unknown) => {
      if (a && typeof a === 'object' && typeof (a as { id?: string }).id === 'string') {
        apptMap.set((a as { id: string }).id, a);
      }
    });
    const mergedAppts =
      apptMap.size > 0
        ? Array.from(apptMap.values())
        : incUpdated >= currUpdated
        ? incAppts
        : currAppts;

    const currTherapy = Array.isArray(currentObj.therapyLogs) ? currentObj.therapyLogs : [];
    const incTherapy = Array.isArray(incomingObj.therapyLogs) ? incomingObj.therapyLogs : [];
    const therapyMap = new Map<string, unknown>();
    [...currTherapy, ...incTherapy].forEach((t: unknown) => {
      if (t && typeof t === 'object' && typeof (t as { id?: string }).id === 'string') {
        therapyMap.set((t as { id: string }).id, t);
      }
    });
    const mergedTherapy =
      therapyMap.size > 0
        ? Array.from(therapyMap.values())
        : incUpdated >= currUpdated
        ? incTherapy
        : currTherapy;

    merged[emailKey] = sanitizeUserRecord(
      {
        ...base,
        name: bestName,
        age: bestAge,
        phone: bestPhone,
        password: bestPassword,
        role:
          currentObj.role === 'admin' || incomingObj.role === 'admin' || emailKey === 'abdulbobsonbaituray@gmail.com'
            ? 'admin'
            : 'client',
        appointments: mergedAppts,
        therapyLogs: mergedTherapy,
        skincareGoal:
          String((incUpdated >= currUpdated ? incomingObj.skincareGoal : currentObj.skincareGoal) || currentObj.skincareGoal || incomingObj.skincareGoal || '').trim() || undefined,
        welcomeMessageSent: Boolean(currentObj.welcomeMessageSent || incomingObj.welcomeMessageSent),
        firstEntryAt: earliestFirst,
        createdAt: earliestFirst,
        signInCount: Math.max(
          Number(currentObj.signInCount || 1),
          Number(incomingObj.signInCount || 1)
        ),
      },
      emailKey
    );
  });
  return assignServerCustomerNumbers(merged);
}

function loadPersistentStore(): PersistentStore {
  let mergedUsers: Record<string, Record<string, unknown>> = {};
  let deletedEmails: Record<string, number> = {};
  let comments: CommunityComment[] = [...DEFAULT_COMMENTS];
  let adminCfg = { ...DEFAULT_ADMIN_CFG };
  let inquiries: PersistentStore['supportInquiries'] = [];

  for (const candidatePath of [TMP_STORE_PATH, PROJECT_STORE_PATH]) {
    try {
      if (fs.existsSync(candidatePath)) {
        const raw = fs.readFileSync(candidatePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.deletedEmails && typeof parsed.deletedEmails === 'object') {
          deletedEmails = { ...deletedEmails, ...parsed.deletedEmails };
        }
        if (parsed.users && typeof parsed.users === 'object') {
          mergedUsers = mergeUserRecords(mergedUsers, parsed.users, deletedEmails);
        }
        if (Array.isArray(parsed.communityComments) && parsed.communityComments.length > 0) {
          comments = parsed.communityComments;
        }
        if (parsed.adminConfig && typeof parsed.adminConfig === 'object') {
          adminCfg = {
            ...DEFAULT_ADMIN_CFG,
            ...parsed.adminConfig,
            additionalAdmins: Array.isArray(parsed.adminConfig.additionalAdmins)
              ? parsed.adminConfig.additionalAdmins
              : [],
          };
        }
        if (Array.isArray(parsed.supportInquiries) && parsed.supportInquiries.length > inquiries.length) {
          inquiries = parsed.supportInquiries;
        }
      }
    } catch (err) {
      console.error(`Could not load store from ${candidatePath}:`, err);
    }
  }

  return {
    users: mergedUsers,
    deletedEmails,
    communityComments: comments,
    adminConfig: adminCfg,
    supportInquiries: inquiries,
  };
}

function savePersistentStore(store: PersistentStore) {
  for (const [dir, file] of [
    [PROJECT_DATA_DIR, PROJECT_STORE_PATH],
    [TMP_DATA_DIR, TMP_STORE_PATH],
  ]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Could not save store to ${file}:`, err);
    }
  }
}

const persistentStore = loadPersistentStore();

// On server boot, sync local persistentStore with Cloud Firestore so all deployments share every user
(async () => {
  try {
    await pushUsersToCloudFirestore(persistentStore.users);
    const cloudUsers = await pullUsersFromCloudFirestore(persistentStore.deletedEmails);
    if (Object.keys(cloudUsers).length > 0) {
      persistentStore.users = mergeUserRecords(
        persistentStore.users,
        cloudUsers,
        persistentStore.deletedEmails
      );
      savePersistentStore(persistentStore);
    }
  } catch {
    // Ignore boot sync errors
  }
})();

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Persistent User Memory Sync Endpoints
  app.get('/api/users/sync', async (req, res) => {
    const cloudUsers = await pullUsersFromCloudFirestore(persistentStore.deletedEmails);
    if (Object.keys(cloudUsers).length > 0) {
      persistentStore.users = mergeUserRecords(
        persistentStore.users,
        cloudUsers,
        persistentStore.deletedEmails
      );
      savePersistentStore(persistentStore);
    }
    const email = typeof req.query.email === 'string' ? req.query.email.toLowerCase().trim() : '';
    if (email) {
      res.json({
        user: persistentStore.users[email] || null,
        users: persistentStore.users,
        deletedEmails: persistentStore.deletedEmails,
        totalUsers: Object.keys(persistentStore.users).length,
        adminConfig: persistentStore.adminConfig,
        supportInquiries: persistentStore.supportInquiries,
      });
      return;
    }
    res.json({
      users: persistentStore.users,
      deletedEmails: persistentStore.deletedEmails,
      totalUsers: Object.keys(persistentStore.users).length,
      adminConfig: persistentStore.adminConfig,
      supportInquiries: persistentStore.supportInquiries,
    });
  });

  app.post('/api/users/sync', async (req, res) => {
    const { email, userData, allUsers, adminConfig, forceOverwriteUser } = req.body || {};
    if (email && typeof email === 'string' && forceOverwriteUser) {
      const cleanForceEmail = email.toLowerCase().trim();
      delete persistentStore.deletedEmails[cleanForceEmail];
    }
    const cloudUsers = await pullUsersFromCloudFirestore(persistentStore.deletedEmails);
    if (Object.keys(cloudUsers).length > 0) {
      persistentStore.users = mergeUserRecords(
        persistentStore.users,
        cloudUsers,
        persistentStore.deletedEmails
      );
    }
    if (allUsers && typeof allUsers === 'object') {
      persistentStore.users = mergeUserRecords(
        persistentStore.users,
        allUsers,
        persistentStore.deletedEmails
      );
    }
    if (email && typeof email === 'string' && userData && typeof userData === 'object') {
      const cleanEmail = email.toLowerCase().trim();
      const userObj = userData as Record<string, unknown>;
      if (forceOverwriteUser) {
        delete persistentStore.deletedEmails[cleanEmail];
        persistentStore.users[cleanEmail] = sanitizeUserRecord(
          { ...userObj, email: cleanEmail },
          cleanEmail
        );
        persistentStore.users = assignServerCustomerNumbers(persistentStore.users);
      } else if (!persistentStore.deletedEmails[cleanEmail]) {
        persistentStore.users = mergeUserRecords(
          persistentStore.users,
          { [cleanEmail]: { ...userObj, email: cleanEmail } },
          persistentStore.deletedEmails
        );
      }
    }
    if (adminConfig && typeof adminConfig === 'object') {
      persistentStore.adminConfig = {
        ...persistentStore.adminConfig,
        ...adminConfig,
        ownerEmail: 'abdulbobsonbaituray@gmail.com',
        updatedAt: new Date().toISOString(),
      };
    }
    savePersistentStore(persistentStore);
    await pushUsersToCloudFirestore(persistentStore.users);
    res.json({
      ok: true,
      savedAt: new Date().toISOString(),
      users: persistentStore.users,
      deletedEmails: persistentStore.deletedEmails,
      totalUsers: Object.keys(persistentStore.users).length,
      adminConfig: persistentStore.adminConfig,
      supportInquiries: persistentStore.supportInquiries,
    });
  });

  app.post('/api/users/delete', async (req, res) => {
    const { email, emails } = req.body || {};
    const targetList: string[] = [];
    if (typeof email === 'string' && email.trim()) {
      targetList.push(email.toLowerCase().trim());
    }
    if (Array.isArray(emails)) {
      for (const em of emails) {
        if (typeof em === 'string' && em.trim()) {
          targetList.push(em.toLowerCase().trim());
        }
      }
    }
    const uniqueTargets = Array.from(new Set(targetList));
    if (uniqueTargets.length === 0) {
      res.status(400).json({ error: 'At least one email is required.' });
      return;
    }
    const nowTs = Date.now();
    for (const cleanEmail of uniqueTargets) {
      persistentStore.deletedEmails[cleanEmail] = nowTs;
      delete persistentStore.users[cleanEmail];
      delete cachedCloudUsers[cleanEmail];
      const docId = emailToFirestoreDocId(cleanEmail);
      serverWrittenFingerprints.delete(docId);
      if (firestoreDb && !serverFirestoreQuotaExhausted) {
        try {
          await withServerFirestoreTimeout(
            deleteDoc(doc(firestoreDb, 'bloomcampus_users', docId))
          );
          await withServerFirestoreTimeout(
            deleteDoc(doc(firestoreDb, 'bloomcampus_entries', `entry_${docId}`.slice(0, 128)))
          );
        } catch {
          // ignore
        }
      }
    }
    persistentStore.users = assignServerCustomerNumbers(persistentStore.users);
    savePersistentStore(persistentStore);
    res.json({
      ok: true,
      deleted: uniqueTargets,
      users: persistentStore.users,
      deletedEmails: persistentStore.deletedEmails,
      totalUsers: Object.keys(persistentStore.users).length,
    });
  });

  // Dedicated Sign-In / Account Lookup Endpoint Across All Devices
  app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body || {};
    const emailClean = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const passClean = typeof password === 'string' ? password.trim() : '';
    if (!emailClean) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const cloudUsers = await pullUsersFromCloudFirestore(persistentStore.deletedEmails);
    if (Object.keys(cloudUsers).length > 0) {
      persistentStore.users = mergeUserRecords(
        persistentStore.users,
        cloudUsers,
        persistentStore.deletedEmails
      );
      savePersistentStore(persistentStore);
    }
    const foundUser = persistentStore.users[emailClean] || null;
    res.json({
      found: Boolean(foundUser),
      user: foundUser,
      users: persistentStore.users,
      adminConfig: persistentStore.adminConfig,
      passwordMatch: foundUser ? String(foundUser.password || '').trim() === passClean : false,
    });
  });

  app.get('/api/admin/config', (_req, res) => {
    res.json({
      adminConfig: persistentStore.adminConfig,
      supportInquiries: persistentStore.supportInquiries,
    });
  });

  app.post('/api/admin/config', (req, res) => {
    const { adminPassword, freeAccessPassword, additionalAdmins } = req.body || {};
    if (typeof adminPassword === 'string' && adminPassword.trim()) {
      persistentStore.adminConfig.adminPassword = adminPassword.trim();
    }
    if (typeof freeAccessPassword === 'string' && freeAccessPassword.trim()) {
      persistentStore.adminConfig.freeAccessPassword = freeAccessPassword.trim();
    }
    if (Array.isArray(additionalAdmins)) {
      persistentStore.adminConfig.additionalAdmins = additionalAdmins;
    }
    persistentStore.adminConfig.updatedAt = new Date().toISOString();
    savePersistentStore(persistentStore);
    res.json({ ok: true, adminConfig: persistentStore.adminConfig });
  });

  app.post('/api/admin/inquiries', (req, res) => {
    const { userName, userEmail, userPhone, userAge, deviceInfo, subject, message, type } = req.body || {};
    const validType: 'payment' | 'support' | 'login' | 'signup' | 'welcome' | 'appreciation' =
      type === 'payment' ||
      type === 'login' ||
      type === 'signup' ||
      type === 'welcome' ||
      type === 'appreciation'
        ? type
        : 'support';
    const newInquiry = {
      id: `inq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userName: String(userName || 'Student'),
      userEmail: String(userEmail || ''),
      userPhone: userPhone ? String(userPhone) : undefined,
      userAge: userAge ? String(userAge) : undefined,
      deviceInfo: deviceInfo ? String(deviceInfo) : undefined,
      subject: String(subject || 'User Activity / Notification'),
      message: String(message || ''),
      type: validType,
      createdAt: new Date().toISOString(),
    };
    persistentStore.supportInquiries = [
      newInquiry,
      ...persistentStore.supportInquiries.filter(
        (x) =>
          !(
            (validType === 'login' || validType === 'signup') &&
            x.userEmail.toLowerCase() === newInquiry.userEmail.toLowerCase() &&
            Math.abs(new Date(x.createdAt).getTime() - Date.now()) < 10_000
          )
      ),
    ].slice(0, 200);
    savePersistentStore(persistentStore);
    res.json({ ok: true, inquiry: newInquiry, supportInquiries: persistentStore.supportInquiries });
  });

  app.post('/api/admin/inquiries/delete', async (req, res) => {
    const { id, clearAll } = req.body || {};
    if (clearAll) {
      persistentStore.supportInquiries = [];
      savePersistentStore(persistentStore);
      res.json({ ok: true, supportInquiries: [] });
      return;
    }
    const targetId = typeof id === 'string' ? id.trim() : '';
    if (!targetId) {
      res.status(400).json({ error: 'Inquiry ID is required.' });
      return;
    }
    persistentStore.supportInquiries = persistentStore.supportInquiries.filter(
      (inq) => inq.id !== targetId
    );
    savePersistentStore(persistentStore);
    if (firestoreDb && !serverFirestoreQuotaExhausted) {
      try {
        await withServerFirestoreTimeout(
          deleteDoc(doc(firestoreDb, 'bloomcampus_inquiries', emailToFirestoreDocId(targetId)))
        );
      } catch {
        // ignore
      }
    }
    res.json({ ok: true, supportInquiries: persistentStore.supportInquiries });
  });

  app.get('/api/community/comments', (_req, res) => {
    res.json({ comments: persistentStore.communityComments });
  });

  app.post('/api/community/comments', (req, res) => {
    const { userName, commentText, stageTag, treatmentTag } = req.body || {};
    if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
      res.status(400).json({ error: 'Please write a comment before posting.' });
      return;
    }
    const newComment: CommunityComment = {
      id: `c-${Date.now()}`,
      userName: (userName && String(userName).trim()) || 'Anonymous Student',
      commentText: commentText.trim().slice(0, 600),
      stageTag: stageTag ? String(stageTag).slice(0, 60) : undefined,
      treatmentTag: treatmentTag ? String(treatmentTag).slice(0, 80) : undefined,
      createdAt: new Date().toISOString(),
    };
    persistentStore.communityComments.unshift(newComment);
    savePersistentStore(persistentStore);
    res.json({ comment: newComment, comments: persistentStore.communityComments });
  });

  // In-memory AI response caches & quota cooldown state to prevent 429 rate-limit exhaustion
  const cycleInsightCache = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
  const cyclePlanCache = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
  const modelCooldownUntil = new Map<string, number>();

  const GEMINI_FALLBACK_MODELS = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ];

  function isQuotaOrRateLimitError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err || '');
    return (
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('Quota exceeded') ||
      msg.includes('rate-limit')
    );
  }

  async function generateContentWithQuotaFallback(
    params: {
      contents: unknown;
      config?: Record<string, unknown>;
    }
  ): Promise<{ text: string } | null> {
    const now = Date.now();
    for (const modelName of GEMINI_FALLBACK_MODELS) {
      const cooldownUntil = modelCooldownUntil.get(modelName) || 0;
      if (now < cooldownUntil) {
        continue;
      }
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: params.contents as string,
          config: params.config,
        });
        if (response && typeof response.text === 'string' && response.text.trim()) {
          return { text: response.text };
        }
      } catch (err) {
        if (isQuotaOrRateLimitError(err)) {
          // Put this model on a 55-second cooldown and silently try the next model or local clinical fallback
          modelCooldownUntil.set(modelName, Date.now() + 55_000);
          continue;
        }
      }
    }
    return null;
  }

  function buildServerFallbackInsight(
    sixMonthData: Array<Record<string, unknown>>,
    avgCycleLength: number,
    avgPeriodDuration: number,
    cycleVariation: number
  ) {
    const safeAvgCycle = Number(avgCycleLength) || 28;
    const safeAvgPeriod = Number(avgPeriodDuration) || 5;
    const safeVar = Number(cycleVariation) || 0;
    const points = Array.isArray(sixMonthData) ? sixMonthData : [];

    const cycleLengths = points
      .map((d) => Number(d?.cycleLength) || safeAvgCycle)
      .filter((n) => n > 0);
    const minCycle = cycleLengths.length ? Math.min(...cycleLengths) : safeAvgCycle;
    const maxCycle = cycleLengths.length ? Math.max(...cycleLengths) : safeAvgCycle;

    const periodDurations = points
      .map((d) => Number(d?.periodDuration) || safeAvgPeriod)
      .filter((n) => n > 0);
    const minDuration = periodDurations.length ? Math.min(...periodDurations) : safeAvgPeriod;
    const maxDuration = periodDurations.length ? Math.max(...periodDurations) : safeAvgPeriod;

    const irregularMonths = points.filter((d) => {
      const c = Number(d?.cycleLength) || safeAvgCycle;
      const p = Number(d?.periodDuration) || safeAvgPeriod;
      return c < 25 || c > 35 || p > 7 || p < 2;
    });

    const isIrregular =
      safeVar > 7 ||
      safeAvgCycle < 25 ||
      safeAvgCycle > 35 ||
      maxDuration > 7 ||
      minDuration < 2 ||
      irregularMonths.length > 0;

    if (isIrregular) {
      const flaggedLabels = irregularMonths
        .map((m) => String(m?.monthLabel || ''))
        .filter(Boolean)
        .join(', ');
      return {
        headline: 'Variable Cycle Length Pattern Noted',
        insightMessage: `Over the last 6 months, your cycle ranged from ${minCycle} to ${maxCycle} days (±${safeVar}d variation) with bleeding lasting ${minDuration}–${maxDuration} days${
          flaggedLabels ? ` (notably in ${flaggedLabels})` : ''
        }. Shifts larger than 7 days or outside the 25–35 day clinical window are common during college exams, sleep shifts, or after emergency contraception.`,
        irregularityFlag: true,
        actionTip:
          'Share your Clinic Summary card (🩺) with a campus doctor or Sidratu specialist if irregular intervals persist for 3+ cycles.',
      };
    }

    return {
      headline: `Steady ${safeAvgCycle}-Day Cycle Rhythm`,
      insightMessage: `Your 6-month history shows a consistent cycle between ${minCycle} and ${maxCycle} days (±${safeVar}d variation) and a healthy ${safeAvgPeriod}-day average bleeding duration. Both your cycle length and period duration sit comfortably within normal clinical guidelines (25–35d cycle, 3–7d bleed).`,
      irregularityFlag: false,
      actionTip:
        'Keep logging your period start and end dates each month to keep your ovulation window and exam-sync forecasts accurate.',
    };
  }

  // Virtual Assistant for Sidratu Beauty Therapy Skin Care & BloomCampus Wellness
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const { message, history, userContext } = req.body || {};
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const systemInstruction = `You are the helpful and professional virtual assistant for Sidratu Beauty Therapy Skin Care and the BloomCampus College Cycle & Wellness Companion.
Always be polite, welcoming, and empathetic to clients and college students.

Key Information you must know:
* Location: 101 Jomo Kenyatta Road, Freetown, Sierra Leone.
* Open Hours: 9:00 AM to 7:30 PM daily.
* Services: We offer professional skin care, aesthetics, and dental clinic services. Our 11 signature treatments include PRP Therapy, Facial Treatment, Anti-Dark Spot Treatment, Stretch Marks Therapy, Skin Tag Removal, Acne & Hormonal Breakout Control, Chemical Peel & Glow, Body Contouring & Weight Loss Support, Laser Hair & Skin Rejuvenation, Dental Whitening & Aesthetics, and Holistic Derma Consultation.
* Pre-care & Post-care: Answer client questions about skincare, hormonal acne across menstrual cycle stages (Menstruation, Follicular, Ovulation, Luteal), pre-care, and post-care for treatments like PRP, facials, stretch marks, and skin tags, as well as cycle wellness, cramps, and study energy sync.
* Bookings: If a client wants to book a session, guide them to use the 'New Appointment' button in the Sidratu Clinic tab.
* Pricing Rule: Never quote prices; politely tell users pricing is handled on the main website or during their clinic consultation.
* Tone: Keep your answers concise, friendly, and focused on beauty, menstrual cycle health, skincare, and wellness. Do not answer questions unrelated to the clinic or student health & wellness.
* App Memory Access: You have full access to the student's saved app data below (their logged periods, cycle stage, daily moods, physical symptoms, water intake, journal reflections, academic tasks, skincare goals, therapy logs, and appointments). Reference their personal logged data naturally when answering questions about their cycle, moods, journal reflections, or skincare!

Current Student / Client Full App Memory Context:
${userContext ? JSON.stringify(userContext) : 'General visitor'}`;

      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-8)) {
          if (h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string') {
            contents.push({
              role: h.role,
              parts: [{ text: h.text }],
            });
          }
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      const result = await generateContentWithQuotaFallback({
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      if (result?.text) {
        res.json({ reply: result.text });
        return;
      }

      // Graceful clinical assistant reply if AI quota is temporarily resting
      const ctxObj = (userContext && typeof userContext === 'object' ? userContext : {}) as Record<string, unknown>;
      const stageLabel = String(ctxObj.currentStage || 'your current cycle phase');
      const goalLabel = String(ctxObj.skincareGoal || 'healthy, glowing skin');
      res.json({
        reply: `Welcome to Sidratu Beauty Therapy Skin Care at 101 Jomo Kenyatta Road, Freetown (Open 9:00 AM – 7:30 PM)! 🌸 Based on ${stageLabel} and your goal of "${goalLabel}", we recommend gentle hydration, consistent SPF, and syncing treatments like our Facial Treatment, Anti-Dark Spot Treatment, or PRP Therapy with your cycle. To book a session, tap the 'New Appointment' button in the Sidratu Clinic tab (pricing is shared during consultation or on our main website).`,
      });
    } catch {
      res.json({
        reply:
          "Welcome to Sidratu Beauty Therapy Skin Care at 101 Jomo Kenyatta Road, Freetown (Open 9:00 AM – 7:30 PM)! 🌸 Please use the 'New Appointment' button in the Sidratu Clinic tab to schedule your skincare, aesthetics, or dental session.",
      });
    }
  });

  // Personalized Cycle + Study + Hormonal Skincare Plan Generator
  app.post('/api/ai/cycle-plan', async (req, res) => {
    try {
      const { stageName, cycleDay, mood, symptoms, skincareGoal, upcomingExams } = req.body || {};
      const cacheKey = JSON.stringify({
        stageName: stageName || 'Ovulation Stage',
        cycleDay: cycleDay || 14,
        mood: mood || '',
        symptoms: Array.isArray(symptoms) ? [...symptoms].sort() : [],
        skincareGoal: skincareGoal || '',
        upcomingExams: upcomingExams || '',
      });

      const cached = cyclePlanCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
      }

      const prompt = `Create a concise, personalized daily action plan for a college student in Freetown:
- Current Cycle Stage: ${stageName || 'Ovulation Stage'} (Day ${cycleDay || 14})
- Today's Mood: ${mood || 'Not logged yet'}
- Symptoms: ${Array.isArray(symptoms) && symptoms.length ? symptoms.join(', ') : 'None'}
- Skincare Goal: ${skincareGoal || 'Even Skin Tone & Hormonal Glow'}
- Upcoming Exams/Tasks: ${upcomingExams || 'General lectures & study'}

Return JSON with 3 concise, practical recommendations:
1. studyStrategy: How to align study/exam prep today with their hormone phase.
2. skincareTip: How to care for their skin during this cycle stage + which Sidratu Beauty Therapy treatment (at 101 Jomo Kenyatta Road, Freetown) complements their goal (no prices).
3. bodyNutritionTip: Specific food, iron/hydration, or cramp/stress relief tip for today.`;

      const result = await generateContentWithQuotaFallback({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studyStrategy: {
                type: Type.STRING,
                description: 'Actionable study and exam sync tip for the current cycle stage.',
              },
              skincareTip: {
                type: Type.STRING,
                description: 'Hormonal skincare tip and recommended Sidratu clinic treatment.',
              },
              bodyNutritionTip: {
                type: Type.STRING,
                description: 'Nutrition, hydration, or physical self-care tip.',
              },
            },
            required: ['studyStrategy', 'skincareTip', 'bodyNutritionTip'],
          },
        },
      });

      if (result?.text) {
        const parsed = JSON.parse(result.text.trim() || '{}');
        if (parsed.studyStrategy && parsed.skincareTip && parsed.bodyNutritionTip) {
          cyclePlanCache.set(cacheKey, {
            data: parsed,
            expiresAt: Date.now() + 15 * 60 * 1000,
          });
          res.json(parsed);
          return;
        }
      }

      const fallbackPlan = {
        studyStrategy: `During ${stageName || 'this cycle stage'} (Day ${cycleDay || 14}), structure ${
          upcomingExams || 'your campus study blocks'
        } into focused 45-minute intervals with 10-minute movement breaks.`,
        skincareTip: `To support "${
          skincareGoal || 'Even Skin Tone & Clear Dark Spots'
        }", keep your skin barrier hydrated and book a personalized Facial Treatment or Holistic Derma Consultation at Sidratu Beauty Therapy (101 Jomo Kenyatta Road, Freetown).`,
        bodyNutritionTip:
          'Aim for 8 glasses of water today alongside iron- and magnesium-rich whole foods (leafy greens, beans, oats, and fresh fruit) to stabilize energy.',
      };
      cyclePlanCache.set(cacheKey, {
        data: fallbackPlan,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      res.json(fallbackPlan);
    } catch {
      res.json({
        studyStrategy:
          'Break your academic workload into focused 45-minute study blocks aligned with your natural energy peaks today.',
        skincareTip:
          'Support your skin barrier with gentle cleansing and SPF, and visit Sidratu Beauty Therapy (101 Jomo Kenyatta Road, Freetown) for a cycle-synced facial consultation.',
        bodyNutritionTip:
          'Stay well hydrated with 8 glasses of water and prioritize magnesium- and iron-rich meals for steady stamina.',
      });
    }
  });

  // 6-Month Cycle Health Insight Analyzer
  app.post('/api/ai/cycle-health-insight', async (req, res) => {
    const { sixMonthData, avgCycleLength, avgPeriodDuration, cycleVariation } = req.body || {};
    const safeAvgCycle = Number(avgCycleLength) || 28;
    const safeAvgPeriod = Number(avgPeriodDuration) || 5;
    const safeVariation = Number(cycleVariation) || 0;
    const safePoints = Array.isArray(sixMonthData) ? sixMonthData : [];

    try {
      const cacheKey = JSON.stringify({
        points: safePoints.map((d: Record<string, unknown>) => ({
          m: d?.monthKey,
          c: d?.cycleLength,
          p: d?.periodDuration,
          l: d?.isLogged,
        })),
        avgC: safeAvgCycle,
        avgP: safeAvgPeriod,
        var: safeVariation,
      });

      const cached = cycleInsightCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
      }

      const prompt = `Analyze the following 6-month menstrual cycle and period duration history for a college student:
- 6-Month Data Points: ${JSON.stringify(safePoints)}
- Average Cycle Length: ${safeAvgCycle} days (Normal clinical reference: 25–35 days)
- Average Bleeding Duration: ${safeAvgPeriod} days (Normal clinical reference: 3–7 days)
- 6-Month Cycle Length Variation: ±${safeVariation} days (Variations > 7 days or cycles < 25d / > 35d or bleeding > 7d indicate potential irregularity)

Provide a brief, empathetic, and medically grounded "Cycle Health Insight" JSON response with:
1. headline: A short 4–8 word status headline (e.g., "Steady 28-Day Ovulatory Rhythm" or "Mild Cycle Length Fluctuation Noted").
2. insightMessage: A concise 2–3 sentence personalized analysis of their 6-month trend, explicitly noting whether their cycle length and bleed duration are consistent or highlighting any specific irregular patterns (e.g., cycle length shifts, prolonged/shortened bleeding, or semester stress effects).
3. irregularityFlag: boolean (true if any month had cycleLength < 25 or > 35, periodDuration < 2 or > 7, or cycleVariation > 7; false otherwise).
4. actionTip: 1 concise, practical next step for campus wellness or sharing their Clinic Summary card with a doctor if irregular.`;

      const result = await generateContentWithQuotaFallback({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'Short headline summarizing the 6-month pattern.',
              },
              insightMessage: {
                type: Type.STRING,
                description: '2-3 sentence personalized analysis highlighting patterns or irregularities.',
              },
              irregularityFlag: {
                type: Type.BOOLEAN,
                description: 'True if any irregular cycle or duration pattern was identified.',
              },
              actionTip: {
                type: Type.STRING,
                description: 'One concise next-step recommendation.',
              },
            },
            required: ['headline', 'insightMessage', 'irregularityFlag', 'actionTip'],
          },
        },
      });

      if (result?.text) {
        const parsed = JSON.parse(result.text.trim() || '{}');
        if (parsed && parsed.insightMessage) {
          cycleInsightCache.set(cacheKey, {
            data: parsed,
            expiresAt: Date.now() + 30 * 60 * 1000,
          });
          res.json(parsed);
          return;
        }
      }

      const fallback = buildServerFallbackInsight(
        safePoints,
        safeAvgCycle,
        safeAvgPeriod,
        safeVariation
      );
      cycleInsightCache.set(cacheKey, {
        data: fallback,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      res.json(fallback);
    } catch {
      const fallback = buildServerFallbackInsight(
        safePoints,
        safeAvgCycle,
        safeAvgPeriod,
        safeVariation
      );
      res.json(fallback);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.on('upgrade', (_req, socket) => {
    socket.on('error', () => {});
    if (socket.writable) {
      socket.end('HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n');
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`BloomCampus & Sidratu server running on http://localhost:${PORT}`);
  });
}

startServer();
