import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  AdminConfig,
  CustomerEntryRecord,
  SidratuAppointment,
  SupportInquiry,
  TherapySessionLog,
  UserData,
} from './types';

// Silence internal @firebase/firestore SDK backoff / quota console.error spam
try {
  setLogLevel('silent');
} catch {
  // ignore
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Circuit breaker & write-deduplication cache to prevent exhausting free-tier daily Firestore writes
let firestoreQuotaExhausted = false;
const lastWrittenHashByPath = new Map<string, string>();

function isFirestoreQuotaOrBackoffError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('maximum backoff delay')
  );
}

function tripFirestoreQuotaBreaker() {
  if (!firestoreQuotaExhausted) {
    firestoreQuotaExhausted = true;
    disableNetwork(db).catch(() => {});
  }
}

function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs = 10000): Promise<T> {
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

async function testConnection() {
  try {
    await withFirestoreTimeout(getDocFromServer(doc(db, 'test', 'connection')), 8000);
  } catch (error) {
    if (isFirestoreQuotaOrBackoffError(error)) {
      tripFirestoreQuotaBreaker();
      return;
    }
  }
}
testConnection();

function computeUserWriteFingerprint(user: UserData): string {
  return JSON.stringify({
    // 1. User Profile & Role
    email: user.email,
    name: user.name,
    age: user.age || '',
    phone: user.phone || '',
    password: user.password || '',
    role: user.role || 'client',
    customerNumber: user.customerNumber || 0,
    firstEntryAt: user.firstEntryAt || user.createdAt || 0,
    skincareGoal: user.skincareGoal || '',
    themeMode: user.themeMode || 'light',
    // 2. Subscription Status & Automated Welcome/Appreciation Flags
    subscriptionStatus: user.subscriptionStatus || 'active',
    subscriptionUntil: user.subscriptionUntil || 0,
    paymentMethod: user.paymentMethod || '2-Week Free Access',
    isVip: Boolean(user.isVip),
    usedFreeAccessPassword: Boolean(user.usedFreeAccessPassword),
    pendingPayment: user.pendingPayment || null,
    paymentHistoryLen: Array.isArray(user.paymentHistory) ? user.paymentHistory.length : 0,
    welcomeMessageSent: Boolean(user.welcomeMessageSent),
    paymentAppreciationPending: Boolean(user.paymentAppreciationPending),
    pushNotificationsEnabled: Boolean(user.pushNotificationsEnabled),
    // 3. Period Tracking, Mood, Appointments & Skincare Information
    periods: Array.isArray(user.periods) ? user.periods : [],
    customCycleLength: user.customCycleLength || 28,
    cycleRemindersEnabled: Boolean(user.cycleRemindersEnabled),
    emergencyPills: Array.isArray(user.emergencyPills) ? user.emergencyPills : [],
    dailyLogs: user.dailyLogs || {},
    journalEntriesLen: Array.isArray(user.journalEntries) ? user.journalEntries.length : 0,
    appointments: Array.isArray(user.appointments) ? user.appointments : [],
    therapyLogs: Array.isArray(user.therapyLogs) ? user.therapyLogs : [],
    academicTasksLen: Array.isArray(user.academicTasks) ? user.academicTasks.length : 0,
    badgesCount: user.unlockedBadges ? Object.keys(user.unlockedBadges).length : 0,
    mythBusterCorrectIds: Array.isArray(user.mythBusterCorrectIds) ? user.mythBusterCorrectIds : [],
    mythBusterAttemptsCount: user.mythBusterAttempts ? Object.keys(user.mythBusterAttempts).length : 0,
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isFirestoreQuotaOrBackoffError(error)) {
    tripFirestoreQuotaBreaker();
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore notice:', JSON.stringify(errInfo));
}

export function getClientDeviceLabel(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'WebApp Link';
  }
  const ua = navigator.userAgent || '';
  const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  let osLabel = 'Web Browser';
  if (/Android/i.test(ua)) osLabel = 'Android Phone';
  else if (/iPhone|iPad|iPod/i.test(ua)) osLabel = 'iPhone / iOS';
  else if (/Windows/i.test(ua)) osLabel = 'Windows Computer';
  else if (/Mac/i.test(ua)) osLabel = 'Mac Computer';
  else if (/Linux/i.test(ua)) osLabel = 'Linux Computer';
  const hostType = window.location.hostname.includes('ais-pre')
    ? 'Shared Link'
    : window.location.hostname.includes('ais-dev')
    ? 'Dev Link'
    : 'WebApp Link';
  return `${isPhone ? '📱' : '💻'} ${osLabel} (${hostType})`;
}

export function emailToDocId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_\-@.+]/g, '_')
    .slice(0, 240);
}

export function cleanFirestorePayload<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function resolveCustomerPhoneUsed(user: Partial<UserData> | null | undefined): string {
  if (!user) return '';
  if (typeof user.phone === 'string' && user.phone.trim()) {
    return user.phone.trim();
  }
  if (user.pendingPayment?.senderPhone && user.pendingPayment.senderPhone.trim()) {
    return user.pendingPayment.senderPhone.trim();
  }
  if (Array.isArray(user.paymentHistory)) {
    for (const ph of user.paymentHistory) {
      if (ph?.senderPhone && ph.senderPhone.trim()) {
        return ph.senderPhone.trim();
      }
    }
  }
  if (Array.isArray(user.entryHistory)) {
    for (const eh of user.entryHistory) {
      if (eh?.phone && eh.phone.trim()) {
        return eh.phone.trim();
      }
    }
  }
  return '';
}

export function assignSequentialCustomerNumbers(
  usersMap: Record<string, UserData>
): Record<string, UserData> {
  const validEntries = Object.entries(usersMap || {}).filter(
    ([k, u]) => u && typeof u === 'object' && (u.email || k)
  );
  // Sort strictly by each customer's FIRST entry timestamp (ascending) so Customer #1 is the first customer entry
  validEntries.sort(([, a], [, b]) => {
    const aFirst = Number(a.firstEntryAt || a.createdAt || Number.MAX_SAFE_INTEGER);
    const bFirst = Number(b.firstEntryAt || b.createdAt || Number.MAX_SAFE_INTEGER);
    if (aFirst !== bFirst) return aFirst - bFirst;
    return (a.email || '').localeCompare(b.email || '');
  });

  const numbered: Record<string, UserData> = {};
  validEntries.forEach(([key, u], index) => {
    const emailClean = (u.email || key).trim().toLowerCase();
    const firstTs =
      Number(u.firstEntryAt) > 0
        ? Number(u.firstEntryAt)
        : Number(u.createdAt) > 0
        ? Number(u.createdAt)
        : Date.now();
    numbered[emailClean] = {
      ...u,
      email: emailClean,
      customerNumber: index + 1,
      firstEntryAt: firstTs,
      createdAt: firstTs,
      phone: resolveCustomerPhoneUsed(u),
    };
  });
  return numbered;
}

export function prepareUserForFirestore(user: UserData, fallbackEmail?: string): UserData | null {
  const emailClean = (user?.email || fallbackEmail || '').trim().toLowerCase().slice(0, 254);
  if (!emailClean || emailClean.length < 3) return null;
  const nameClean = (user?.name || emailClean.split('@')[0] || 'Student').trim().slice(0, 200);
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const firstEntryMs =
    Number(user?.firstEntryAt) > 0
      ? Number(user.firstEntryAt)
      : Number(user?.createdAt) > 0
      ? Number(user.createdAt)
      : Date.now();
  const phoneUsed = resolveCustomerPhoneUsed(user).slice(0, 60);
  const ageUsed = String(user?.age || '').trim().slice(0, 20);
  const passwordUsed = String(user?.password || '').trim().slice(0, 200);

  const normalizedPeriods = Array.isArray(user?.periods)
    ? user.periods
        .filter((p) => p && typeof p.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate))
        .map((p) => ({
          startDate: p.startDate,
          endDate: p.endDate && /^\d{4}-\d{2}-\d{2}$/.test(p.endDate) ? p.endDate : null,
        }))
    : [];

  const resolvedRole: 'admin' | 'client' =
    user?.role === 'admin' || emailClean === 'abdulbobsonbaituray@gmail.com'
      ? 'admin'
      : 'client';

  const cleaned = cleanFirestorePayload({
    ...user,
    // 1. User Profile & Role-Based Permission
    email: emailClean,
    name: nameClean || 'Student',
    age: ageUsed,
    phone: phoneUsed,
    password: passwordUsed,
    role: resolvedRole,
    firstEntryAt: firstEntryMs,
    createdAt: firstEntryMs,
    deviceInfo: (user?.deviceInfo || getClientDeviceLabel()).slice(0, 200),
    lastAppUrl:
      user?.lastAppUrl ||
      (typeof window !== 'undefined' ? window.location.origin : ''),
    lastUpdatedAt: user?.lastUpdatedAt || new Date().toISOString(),
    // 2. Subscription Status & Automated Welcome/Appreciation State
    subscriptionStatus: user?.subscriptionStatus || 'active',
    subscriptionUntil:
      user?.subscriptionUntil !== undefined
        ? user.subscriptionUntil
        : firstEntryMs + twoWeeksMs,
    paymentMethod: (user?.paymentMethod || '2-Week Free Access').slice(0, 200),
    isVip: Boolean(user?.isVip),
    usedFreeAccessPassword: Boolean(user?.usedFreeAccessPassword),
    pendingPayment: user?.pendingPayment || null,
    paymentHistory: Array.isArray(user?.paymentHistory) ? user.paymentHistory : [],
    welcomeMessageSent: Boolean(user?.welcomeMessageSent),
    welcomeMessageSentAt: user?.welcomeMessageSentAt || '',
    welcomeMessagePendingModal: Boolean(user?.welcomeMessagePendingModal),
    paymentAppreciationPending: Boolean(user?.paymentAppreciationPending),
    lastPaymentAppreciationAt: user?.lastPaymentAppreciationAt || '',
    lastPaymentAppreciationAmount: user?.lastPaymentAppreciationAmount || '',
    // 3. Period Tracking, Mood, Skincare & Client Appointments
    periods: normalizedPeriods,
    customCycleLength:
      typeof user?.customCycleLength === 'number' && user.customCycleLength >= 21 && user.customCycleLength <= 45
        ? user.customCycleLength
        : 28,
    cycleRemindersEnabled: Boolean(user?.cycleRemindersEnabled),
    pushNotificationsEnabled: Boolean(user?.pushNotificationsEnabled),
    appointmentRemindersEnabled: user?.appointmentRemindersEnabled !== false,
    dailyCheckinRemindersEnabled: Boolean(user?.dailyCheckinRemindersEnabled),
    emergencyPills: Array.isArray(user?.emergencyPills) ? user.emergencyPills : [],
    dailyLogs: user?.dailyLogs && typeof user.dailyLogs === 'object' ? user.dailyLogs : {},
    journalEntries: Array.isArray(user?.journalEntries) ? user.journalEntries : [],
    skincareGoal: (user?.skincareGoal || 'Even Skin Tone & Clear Dark Spots').slice(0, 120),
    appointments: Array.isArray(user?.appointments) ? user.appointments : [],
    therapyLogs: Array.isArray(user?.therapyLogs) ? user.therapyLogs : [],
    academicTasks: Array.isArray(user?.academicTasks) ? user.academicTasks : [],
    unlockedBadges: user?.unlockedBadges && typeof user.unlockedBadges === 'object' ? user.unlockedBadges : {},
  });
  return cleaned;
}

export async function logCustomerEntryToFirestore(
  user: UserData,
  entryType: CustomerEntryRecord['entryType'] = 'Sign In'
): Promise<void> {
  if (firestoreQuotaExhausted) return;
  const prepared = prepareUserForFirestore(user);
  if (!prepared) return;
  const docId = emailToDocId(prepared.email);
  const userPath = `bloomcampus_users/${docId}`;
  const fingerprint = computeUserWriteFingerprint(prepared) + `|${entryType}`;
  if (
    entryType === 'WebApp Session' &&
    lastWrittenHashByPath.get(userPath) === fingerprint
  ) {
    return;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const latestEmailEntryId = `entry_${docId}`.slice(0, 128);
  const entryDoc: CustomerEntryRecord = {
    id: latestEmailEntryId,
    customerNumber: prepared.customerNumber,
    name: prepared.name.slice(0, 200),
    email: prepared.email.slice(0, 254),
    age: String(prepared.age || '').slice(0, 20),
    phone: String(prepared.phone || '').slice(0, 60),
    password: String(prepared.password || '').slice(0, 200),
    entryType,
    deviceInfo: (prepared.deviceInfo || getClientDeviceLabel()).slice(0, 200),
    appUrl:
      typeof window !== 'undefined' ? window.location.origin.slice(0, 200) : '',
    firstEntryAt: prepared.firstEntryAt || prepared.createdAt || nowMs,
    timestamp: nowMs,
    timestampIso: nowIso,
  };

  try {
    await withFirestoreTimeout(
      setDoc(
        doc(db, 'bloomcampus_users', docId),
        {
          ...prepared,
          lastSignInAt: nowIso,
          lastUpdatedAt: nowIso,
        },
        { merge: true }
      )
    );
    await withFirestoreTimeout(
      setDoc(
        doc(db, 'bloomcampus_entries', latestEmailEntryId),
        cleanFirestorePayload(entryDoc),
        { merge: true }
      )
    );

    // Also record a real-time login/signup notification in `bloomcampus_inquiries` so the Owner Admin sees everyone logging in
    if (entryType === 'Create Account' || entryType === 'Sign In') {
      const loginInqId = `login_${docId}`.slice(0, 128);
      const loginInq: SupportInquiry = {
        id: loginInqId,
        userName: entryDoc.name,
        userEmail: entryDoc.email,
        userPhone: entryDoc.phone || 'Not entered',
        userAge: entryDoc.age || '21',
        deviceInfo: entryDoc.deviceInfo,
        subject: `${entryType === 'Create Account' ? '🆕 New Sign-Up' : '🔑 User Sign-In'}: ${entryDoc.name} (${entryDoc.email})`,
        message: `Customer #${entryDoc.customerNumber || 1} • Name: ${entryDoc.name} • Email: ${entryDoc.email} • Age: ${entryDoc.age || '21'} • Phone Used: ${entryDoc.phone || 'Not entered'} • Action: ${entryType} • Device: ${entryDoc.deviceInfo} • Time: ${new Date(nowMs).toLocaleString()}`,
        type: entryType === 'Create Account' ? 'signup' : 'login',
        createdAt: nowIso,
      };
      await withFirestoreTimeout(
        setDoc(
          doc(db, 'bloomcampus_inquiries', loginInqId),
          cleanFirestorePayload(loginInq),
          { merge: true }
        )
      );
    }

    lastWrittenHashByPath.set(userPath, fingerprint);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncUserToFirestore(user: UserData, fallbackEmail?: string): Promise<void> {
  if (firestoreQuotaExhausted) return;
  const prepared = prepareUserForFirestore(user, fallbackEmail);
  if (!prepared) return;
  const docId = emailToDocId(prepared.email);
  const path = `bloomcampus_users/${docId}`;
  const fingerprint = computeUserWriteFingerprint(prepared);
  if (lastWrittenHashByPath.get(path) === fingerprint) {
    return;
  }

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'bloomcampus_users', docId), prepared, { merge: true })
    );
    lastWrittenHashByPath.set(path, fingerprint);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncAllUsersToFirestore(
  usersMap: Record<string, UserData>
): Promise<void> {
  if (firestoreQuotaExhausted) return;
  const numbered = assignSequentialCustomerNumbers(usersMap || {});
  const entries = Object.entries(numbered);
  for (const [key, u] of entries) {
    if (firestoreQuotaExhausted) break;
    if (!u || typeof u !== 'object') continue;
    const prepared = prepareUserForFirestore(u, key);
    if (!prepared) continue;
    const docId = emailToDocId(prepared.email);
    const path = `bloomcampus_users/${docId}`;
    const fingerprint = computeUserWriteFingerprint(prepared);
    if (lastWrittenHashByPath.get(path) === fingerprint) {
      continue;
    }
    try {
      await withFirestoreTimeout(
        setDoc(doc(db, 'bloomcampus_users', docId), prepared, { merge: true })
      );
      lastWrittenHashByPath.set(path, fingerprint);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

function mergeEntryLogIntoUser(
  existing: UserData | undefined,
  entry: CustomerEntryRecord
): UserData {
  const emailClean = entry.email.trim().toLowerCase();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const firstTs =
    existing && Number(existing.firstEntryAt || existing.createdAt) > 0
      ? Math.min(
          Number(existing.firstEntryAt || existing.createdAt),
          Number(entry.firstEntryAt || entry.timestamp || Date.now())
        )
      : Number(entry.firstEntryAt || entry.timestamp || Date.now());
  const entryIso =
    entry.timestampIso ||
    (entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString());

  if (!existing) {
    return {
      name: entry.name || emailClean.split('@')[0] || 'Student',
      age: entry.age || '',
      email: emailClean,
      phone: entry.phone || '',
      password: entry.password || '',
      firstEntryAt: firstTs,
      createdAt: firstTs,
      lastUpdatedAt: entryIso,
      lastSignInAt: entryIso,
      signInCount: 1,
      signupSource: entry.entryType || 'Sign In',
      deviceInfo: entry.deviceInfo || 'WebApp Link',
      isVip: false,
      usedFreeAccessPassword: false,
      subscriptionStatus: 'active',
      subscriptionUntil: firstTs + twoWeeksMs,
      paymentMethod: '2-Week Free Access',
      periods: [],
      emergencyPills: [],
      dailyLogs: {},
    };
  }

  const existingSignInMs = existing.lastSignInAt ? new Date(existing.lastSignInAt).getTime() : 0;
  const entryTsMs = Number(entry.timestamp) || new Date(entryIso).getTime() || 0;
  const latestSignInIso =
    entryTsMs > existingSignInMs ? entryIso : existing.lastSignInAt || entryIso;

  return {
    ...existing,
    email: emailClean,
    name:
      existing.name && existing.name !== emailClean.split('@')[0]
        ? existing.name
        : entry.name || existing.name || 'Student',
    age: existing.age || entry.age || '',
    phone: resolveCustomerPhoneUsed(existing) || entry.phone || '',
    password: existing.password || entry.password || '',
    firstEntryAt: firstTs,
    createdAt: firstTs,
    deviceInfo: entry.deviceInfo || existing.deviceInfo || 'WebApp Link',
    lastSignInAt: latestSignInIso,
    lastUpdatedAt:
      entryTsMs > (existing.lastUpdatedAt ? new Date(existing.lastUpdatedAt).getTime() : 0)
        ? entryIso
        : existing.lastUpdatedAt || entryIso,
  };
}

const DELETED_EMAILS_STORAGE_KEY = 'bloomcampus_deleted_emails_v1';

export function getLocalDeletedEmailsMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DELETED_EMAILS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function markEmailDeletedLocally(emailOrEmails: string | string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalDeletedEmailsMap();
    const list = Array.isArray(emailOrEmails) ? emailOrEmails : [emailOrEmails];
    const nowTs = Date.now();
    for (const em of list) {
      const clean = String(em || '').trim().toLowerCase();
      if (clean) {
        current[clean] = nowTs;
      }
    }
    localStorage.setItem(DELETED_EMAILS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function clearDeletedEmailLocally(email: string): void {
  if (typeof window === 'undefined' || !email) return;
  try {
    const clean = email.trim().toLowerCase();
    const current = getLocalDeletedEmailsMap();
    if (current[clean]) {
      delete current[clean];
      localStorage.setItem(DELETED_EMAILS_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore
  }
}

export function isEmailDeletedLocally(email: string): boolean {
  if (!email) return false;
  const current = getLocalDeletedEmailsMap();
  return Boolean(current[email.trim().toLowerCase()]);
}

export async function fetchAllUsersFromFirestore(): Promise<Record<string, UserData>> {
  if (firestoreQuotaExhausted) return {};
  const deletedMap = getLocalDeletedEmailsMap();
  const path = 'bloomcampus_users';
  const result: Record<string, UserData> = {};
  try {
    const snap = await withFirestoreTimeout(getDocs(collection(db, path)));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as UserData;
      if (data && data.email) {
        const emailClean = data.email.trim().toLowerCase();
        if (deletedMap[emailClean]) return;
        result[emailClean] = {
          ...data,
          email: emailClean,
          phone: resolveCustomerPhoneUsed(data),
        };
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  if (firestoreQuotaExhausted) {
    return assignSequentialCustomerNumbers(result);
  }

  try {
    const entriesSnap = await withFirestoreTimeout(
      getDocs(collection(db, 'bloomcampus_entries'))
    );
    entriesSnap.forEach((docSnap) => {
      const entry = docSnap.data() as CustomerEntryRecord;
      if (entry && entry.email) {
        const emailClean = entry.email.trim().toLowerCase();
        if (deletedMap[emailClean]) return;
        result[emailClean] = mergeEntryLogIntoUser(result[emailClean], entry);
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bloomcampus_entries');
  }

  return assignSequentialCustomerNumbers(result);
}

export async function deleteUserFromFirestore(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  markEmailDeletedLocally(clean);
  if (firestoreQuotaExhausted) return;
  const docId = emailToDocId(clean);
  const path = `bloomcampus_users/${docId}`;
  try {
    await withFirestoreTimeout(deleteDoc(doc(db, 'bloomcampus_users', docId)));
    await withFirestoreTimeout(
      deleteDoc(doc(db, 'bloomcampus_entries', `entry_${docId}`.slice(0, 128)))
    );
    lastWrittenHashByPath.delete(path);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteMultipleUsersFromFirestore(emails: string[]): Promise<void> {
  const cleaned = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return;
  markEmailDeletedLocally(cleaned);
  for (const em of cleaned) {
    await deleteUserFromFirestore(em);
  }
}

export function subscribeToAllUsersFirestore(
  onUpdate: (users: Record<string, UserData>) => void
): () => void {
  if (firestoreQuotaExhausted) {
    return () => {};
  }
  const path = 'bloomcampus_users';
  let latestUsersSnap: Record<string, UserData> = {};
  let latestEntriesSnap: CustomerEntryRecord[] = [];

  const emitCombined = () => {
    const deletedMap = getLocalDeletedEmailsMap();
    const combined: Record<string, UserData> = {};
    for (const [emailKey, u] of Object.entries(latestUsersSnap)) {
      if (!deletedMap[emailKey]) {
        combined[emailKey] = u;
      }
    }
    for (const entry of latestEntriesSnap) {
      if (entry && typeof entry.email === 'string') {
        const emailKey = entry.email.trim().toLowerCase();
        if (deletedMap[emailKey]) continue;
        combined[emailKey] = mergeEntryLogIntoUser(combined[emailKey], entry);
      }
    }
    onUpdate(assignSequentialCustomerNumbers(combined));
  };

  const unsubUsers = onSnapshot(
    collection(db, path),
    (snapshot) => {
      const deletedMap = getLocalDeletedEmailsMap();
      const users: Record<string, UserData> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserData;
        if (data && typeof data.email === 'string') {
          const emailKey = data.email.trim().toLowerCase();
          if (deletedMap[emailKey]) return;
          users[emailKey] = {
            ...data,
            email: emailKey,
            phone: resolveCustomerPhoneUsed(data),
          };
        }
      });
      latestUsersSnap = users;
      emitCombined();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );

  const unsubEntries = onSnapshot(
    collection(db, 'bloomcampus_entries'),
    (snapshot) => {
      const deletedMap = getLocalDeletedEmailsMap();
      const entries: CustomerEntryRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CustomerEntryRecord;
        if (data && typeof data.email === 'string') {
          const emailKey = data.email.trim().toLowerCase();
          if (deletedMap[emailKey]) return;
          entries.push(data);
        }
      });
      latestEntriesSnap = entries;
      emitCombined();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bloomcampus_entries');
    }
  );

  return () => {
    unsubUsers();
    unsubEntries();
  };
}

export async function syncAdminConfigToFirestore(cfg: AdminConfig): Promise<void> {
  if (firestoreQuotaExhausted) return;
  const path = 'bloomcampus_config/admin';
  const cleaned = cleanFirestorePayload({
    ownerEmail: (cfg.ownerEmail || 'abdulbobsonbaituray@gmail.com').slice(0, 254),
    adminPassword: (cfg.adminPassword || '@Haizen565.').slice(0, 200),
    freeAccessPassword: (cfg.freeAccessPassword || 'Bobson@565').slice(0, 200),
    additionalAdmins: Array.isArray(cfg.additionalAdmins) ? cfg.additionalAdmins : [],
    updatedAt: cfg.updatedAt || new Date().toISOString(),
  });
  const fingerprint = JSON.stringify({
    ownerEmail: cleaned.ownerEmail,
    adminPassword: cleaned.adminPassword,
    freeAccessPassword: cleaned.freeAccessPassword,
    additionalAdmins: cleaned.additionalAdmins,
  });
  if (lastWrittenHashByPath.get(path) === fingerprint) {
    return;
  }
  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'bloomcampus_config', 'admin'), cleaned, { merge: true })
    );
    lastWrittenHashByPath.set(path, fingerprint);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAdminConfigFromFirestore(): Promise<AdminConfig | null> {
  if (firestoreQuotaExhausted) return null;
  const path = 'bloomcampus_config/admin';
  try {
    const snap = await withFirestoreTimeout(getDoc(doc(db, 'bloomcampus_config', 'admin')));
    if (snap.exists()) {
      return snap.data() as AdminConfig;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export function subscribeToAdminConfigFirestore(
  onUpdate: (cfg: AdminConfig) => void
): () => void {
  if (firestoreQuotaExhausted) {
    return () => {};
  }
  const path = 'bloomcampus_config/admin';
  return onSnapshot(
    doc(db, 'bloomcampus_config', 'admin'),
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as AdminConfig);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function syncSupportInquiryToFirestore(inq: SupportInquiry): Promise<void> {
  if (firestoreQuotaExhausted) return;
  const docId = emailToDocId(inq.id || `inq-${Date.now()}`);
  const path = `bloomcampus_inquiries/${docId}`;
  if (lastWrittenHashByPath.has(path)) {
    return;
  }
  const validType: SupportInquiry['type'] =
    inq.type === 'payment' ||
    inq.type === 'login' ||
    inq.type === 'signup' ||
    inq.type === 'welcome' ||
    inq.type === 'appreciation'
      ? inq.type
      : 'support';
  const cleaned = cleanFirestorePayload({
    id: String(inq.id || docId).slice(0, 128),
    userName: String(inq.userName || 'Student').slice(0, 200),
    userEmail: String(inq.userEmail || 'student@campus.edu').slice(0, 254),
    userPhone: inq.userPhone ? String(inq.userPhone).slice(0, 60) : '',
    subject: String(inq.subject || 'Inquiry').slice(0, 300),
    message: String(inq.message || '').slice(0, 5000),
    type: validType,
    createdAt: String(inq.createdAt || new Date().toISOString()).slice(0, 64),
  });
  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'bloomcampus_inquiries', docId), cleaned, { merge: true })
    );
    lastWrittenHashByPath.set(path, 'written');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncClientAppointmentToFirestore(
  userEmail: string,
  userName: string,
  appointment: SidratuAppointment
): Promise<void> {
  if (firestoreQuotaExhausted || !userEmail || !appointment?.id) return;
  const docId = emailToDocId(`${userEmail}_${appointment.id}`).slice(0, 128);
  const path = `bloomcampus_appointments/${docId}`;
  const cleaned = cleanFirestorePayload({
    id: String(appointment.id).slice(0, 128),
    userEmail: userEmail.trim().toLowerCase().slice(0, 254),
    userName: (userName || 'Client').trim().slice(0, 200),
    treatmentType: String(appointment.treatmentType || 'Facial Treatment').slice(0, 200),
    requestedDate: String(appointment.requestedDate || '').slice(0, 32),
    requestedTime: String(appointment.requestedTime || '').slice(0, 32),
    notes: String(appointment.notes || '').slice(0, 1000),
    status: appointment.status === 'Pending' ? 'Pending' : 'Confirmed',
    createdAt: String(appointment.createdAt || new Date().toISOString()).slice(0, 64),
  });
  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'bloomcampus_appointments', docId), cleaned, { merge: true })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncClientSkincareLogToFirestore(
  userEmail: string,
  log: TherapySessionLog
): Promise<void> {
  if (firestoreQuotaExhausted || !userEmail || !log?.id) return;
  const docId = emailToDocId(`${userEmail}_${log.id}`).slice(0, 128);
  const path = `bloomcampus_skincare_logs/${docId}`;
  const cleaned = cleanFirestorePayload({
    id: String(log.id).slice(0, 128),
    userEmail: userEmail.trim().toLowerCase().slice(0, 254),
    treatmentType: String(log.treatmentType || 'Facial Treatment').slice(0, 200),
    sessionDate: String(log.sessionDate || '').slice(0, 32),
    postSessionFeeling: String(log.postSessionFeeling || '').slice(0, 2000),
    stageAtSession: String(log.stageAtSession || '').slice(0, 64),
  });
  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'bloomcampus_skincare_logs', docId), cleaned, { merge: true })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSupportInquiryFromFirestore(id: string): Promise<void> {
  if (firestoreQuotaExhausted || !id) return;
  const docId = emailToDocId(id);
  const path = `bloomcampus_inquiries/${docId}`;
  try {
    await withFirestoreTimeout(deleteDoc(doc(db, 'bloomcampus_inquiries', docId)));
    lastWrittenHashByPath.delete(path);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToSupportInquiriesFirestore(
  onUpdate: (inquiries: SupportInquiry[]) => void
): () => void {
  if (firestoreQuotaExhausted) {
    return () => {};
  }
  const path = 'bloomcampus_inquiries';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items: SupportInquiry[] = [];
      snap.forEach((d) => {
        items.push(d.data() as SupportInquiry);
      });
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchSingleUserFromFirestore(email: string): Promise<UserData | null> {
  if (firestoreQuotaExhausted || !email) return null;
  const emailClean = email.trim().toLowerCase();
  if (isEmailDeletedLocally(emailClean)) return null;
  const docId = emailToDocId(emailClean);
  const path = `bloomcampus_users/${docId}`;
  try {
    const snap = await withFirestoreTimeout(getDoc(doc(db, 'bloomcampus_users', docId)));
    if (snap.exists()) {
      const data = snap.data() as UserData;
      return {
        ...data,
        email: emailClean,
        phone: resolveCustomerPhoneUsed(data),
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function signUpWithEmailPasswordFirebase(
  email: string,
  password: string
): Promise<FirebaseUser | null> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch {
    return null;
  }
}

export async function signInWithEmailPasswordFirebase(
  email: string,
  password: string
): Promise<FirebaseUser | null> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch {
    return null;
  }
}

export async function signInWithGooglePopup() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export function subscribeToFirebaseAuth(
  onUserChanged: (user: FirebaseUser | null) => void
): () => void {
  return onAuthStateChanged(auth, onUserChanged);
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}
