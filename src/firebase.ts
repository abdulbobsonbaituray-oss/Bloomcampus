import { initializeApp } from 'firebase/app';
import { getAnalytics, Analytics } from 'firebase/analytics';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';
import { OWNER_ADMIN_EMAIL } from './constants';
import {
  AdminConfig,
  CustomerEntryRecord,
  SidratuAppointment,
  SupportInquiry,
  TherapySessionLog,
  UserData,
} from './types';

export const firebaseConfig = firebaseConfigJson;

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch {
    // Analytics may be blocked in restricted browser/iframe environments
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration or network connection.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export interface FirebaseAuthVerificationResult {
  user: FirebaseUser | null;
  emailVerified: boolean;
  verificationEmailSent: boolean;
  errorCode?: string;
  errorMessage?: string;
}

function toFirebaseAuthPassword(rawPassword: string): string {
  const trimmed = (rawPassword || '').trim();
  if (trimmed.length >= 6) return trimmed;
  return trimmed.padEnd(6, '0');
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
    .slice(0, 128);
}

function toSafeRuleId(rawId: string, fallbackPrefix = 'item'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
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

// ============================================================================
// FIREBASE AUTHENTICATION FUNCTIONS
// ============================================================================

export async function setFirebaseAuthRememberPersistence(remember: boolean): Promise<void> {
  try {
    await setPersistence(
      auth,
      remember ? browserLocalPersistence : browserSessionPersistence
    );
  } catch {
    // ignore if browser blocks storage persistence change
  }
}

export async function signUpWithEmailPasswordFirebase(
  email: string,
  password: string,
  displayName?: string
): Promise<FirebaseAuthVerificationResult> {
  const cleanEmail = email.trim().toLowerCase();
  const fbPass = toFirebaseAuthPassword(password);
  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, fbPass);
    if (displayName && displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => {});
    }
    let verificationSent = false;
    try {
      await sendEmailVerification(cred.user);
      verificationSent = true;
    } catch {
      // ignore if throttled
    }
    // Always sign out immediately after account creation so every user logs in via the Log In section
    await signOut(auth).catch(() => {});
    return {
      user: cred.user,
      emailVerified: false,
      verificationEmailSent: verificationSent,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    const message = (err as { message?: string })?.message || '';
    if (code === 'auth/email-already-in-use') {
      try {
        const signInCred = await signInWithEmailAndPassword(auth, cleanEmail, fbPass);
        await reload(signInCred.user).catch(() => {});
        if (displayName && displayName.trim() && !signInCred.user.displayName) {
          await updateProfile(signInCred.user, { displayName: displayName.trim() }).catch(() => {});
        }
        let verificationSent = false;
        if (!signInCred.user.emailVerified) {
          try {
            await sendEmailVerification(signInCred.user);
            verificationSent = true;
          } catch {
            // ignore if throttled
          }
        }
        await signOut(auth).catch(() => {});
        return {
          user: signInCred.user,
          emailVerified: Boolean(signInCred.user.emailVerified),
          verificationEmailSent: verificationSent,
          errorCode: code,
        };
      } catch {
        return {
          user: null,
          emailVerified: false,
          verificationEmailSent: false,
          errorCode: code,
          errorMessage: message,
        };
      }
    }
    return {
      user: null,
      emailVerified: false,
      verificationEmailSent: false,
      errorCode: code,
      errorMessage: message,
    };
  }
}

export interface ResendVerificationResult {
  sent: boolean;
  alreadyVerified?: boolean;
  throttled?: boolean;
  errorMessage?: string;
}

export async function signInWithEmailPasswordFirebase(
  email: string,
  password: string,
  allowCreateIfMissing = false,
  displayName?: string
): Promise<FirebaseAuthVerificationResult> {
  const cleanEmail = email.trim().toLowerCase();
  const fbPass = toFirebaseAuthPassword(password);
  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, fbPass);
    await reload(cred.user).catch(() => {});
    if (displayName && displayName.trim() && !cred.user.displayName) {
      await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => {});
    }
    if (!cred.user.emailVerified) {
      await signOut(auth).catch(() => {});
      return {
        user: cred.user,
        emailVerified: false,
        verificationEmailSent: false,
        errorCode: 'auth/email-not-verified',
      };
    }
    return {
      user: cred.user,
      emailVerified: true,
      verificationEmailSent: false,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    const message = (err as { message?: string })?.message || '';
    if (
      allowCreateIfMissing &&
      (code === 'auth/user-not-found' || code === 'auth/invalid-credential')
    ) {
      try {
        const created = await createUserWithEmailAndPassword(auth, cleanEmail, fbPass);
        if (displayName && displayName.trim()) {
          await updateProfile(created.user, { displayName: displayName.trim() }).catch(() => {});
        }
        let verificationSent = false;
        try {
          await sendEmailVerification(created.user);
          verificationSent = true;
        } catch {
          // ignore
        }
        await signOut(auth).catch(() => {});
        return {
          user: created.user,
          emailVerified: false,
          verificationEmailSent: verificationSent,
          errorCode: 'auth/email-not-verified',
        };
      } catch {
        return {
          user: null,
          emailVerified: false,
          verificationEmailSent: false,
          errorCode: code,
          errorMessage: message,
        };
      }
    }
    return {
      user: null,
      emailVerified: false,
      verificationEmailSent: false,
      errorCode: code,
      errorMessage: message,
    };
  }
}

export async function resendVerificationEmailFirebase(
  email: string,
  password: string
): Promise<ResendVerificationResult> {
  const cleanEmail = email.trim().toLowerCase();
  const fbPass = toFirebaseAuthPassword(password);
  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, fbPass);
    try {
      await reload(cred.user).catch(() => {});
      if (cred.user.emailVerified) {
        return { sent: false, alreadyVerified: true };
      }
      await sendEmailVerification(cred.user);
      return { sent: true };
    } catch (innerErr: unknown) {
      const innerCode = (innerErr as { code?: string })?.code || '';
      if (innerCode === 'auth/too-many-requests') {
        return {
          sent: false,
          throttled: true,
          errorMessage:
            'A verification email was recently sent. Please check your inbox and spam folder or wait a minute before retrying.',
        };
      }
      return {
        sent: false,
        errorMessage: 'Could not resend verification email right now. Please try again shortly.',
      };
    } finally {
      await signOut(auth).catch(() => {});
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return {
        sent: false,
        errorMessage: 'Please enter your correct account password to resend the verification email.',
      };
    }
    return {
      sent: false,
      errorMessage: 'Unable to resend verification email. Please verify your email and password.',
    };
  }
}

export async function sendPasswordResetEmailFirebase(email: string): Promise<boolean> {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
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

export async function getCurrentFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

// ============================================================================
// REAL FIRESTORE PERSISTENCE (UID-SCOPED & PRIVACY-ENFORCED)
// ============================================================================

const ALLOWED_USER_KEYS = new Set<string>([
  'uid',
  'email',
  'name',
  'age',
  'phone',
  'role',
  'createdAt',
  'firstEntryAt',
  'customerNumber',
  'lastUpdatedAt',
  'lastSignInAt',
  'signInCount',
  'signupSource',
  'deviceInfo',
  'lastAppUrl',
  'entryHistory',
  'isVip',
  'usedFreeAccessPassword',
  'subscriptionStatus',
  'subscriptionUntil',
  'paymentMethod',
  'pendingPayment',
  'approvalWelcomePending',
  'lastApprovedExpirationDate',
  'paymentHistory',
  'periods',
  'emergencyPills',
  'dailyLogs',
  'journalEntries',
  'skincareGoal',
  'therapyLogs',
  'appointments',
  'academicTasks',
  'cycleRemindersEnabled',
  'lastReminderNotifiedForPeriod',
  'phaseShiftNotificationsEnabled',
  'lastNotifiedStageKey',
  'lastPhaseShiftNotifiedAt',
  'lastPhaseShiftSummary',
  'pushNotificationsEnabled',
  'appointmentRemindersEnabled',
  'dailyCheckinRemindersEnabled',
  'lastPushNotificationSentAt',
  'welcomeMessageSent',
  'welcomeMessageSentAt',
  'welcomeMessagePendingModal',
  'paymentAppreciationPending',
  'lastPaymentAppreciationAt',
  'lastPaymentAppreciationAmount',
  'themeMode',
  'customCycleLength',
  'unlockedBadges',
  'mythBusterCorrectIds',
  'mythBusterAttempts',
  'submittedFreeCode',
]);

// Cache last-known raw Firestore documents by docId so updates strictly satisfy firestore.rules affectedKeys()
const lastKnownUserDocCache = new Map<string, Record<string, unknown>>();

function isCurrentUserVerified(): boolean {
  const fbUser = auth.currentUser;
  if (!fbUser) return false;
  const isGoogle = fbUser.providerData.some((p) => p.providerId === 'google.com');
  return Boolean(fbUser.emailVerified || isGoogle);
}

function isCurrentUserOwnerAdmin(): boolean {
  const email = auth.currentUser?.email?.trim().toLowerCase();
  return Boolean(isCurrentUserVerified() && email === OWNER_ADMIN_EMAIL.toLowerCase());
}

export function sanitizeUserForFirestore(
  uid: string,
  rawUser: UserData
): Record<string, unknown> {
  const cleanEmail = (rawUser.email || '').trim().toLowerCase();
  const cleanName = (rawUser.name || cleanEmail.split('@')[0] || 'Student').trim().slice(0, 200);
  const realPeriods = Array.isArray(rawUser.periods)
    ? rawUser.periods
        .filter((p) => p && !p.autoGenerated && typeof p.startDate === 'string' && p.startDate)
        .slice(-120)
        .map((p) => ({
          startDate: p.startDate,
          endDate: p.endDate && p.endDate >= p.startDate ? p.endDate : null,
        }))
    : [];

  const sanitized: Record<string, unknown> = {};
  const rawRecord = rawUser as unknown as Record<string, unknown>;

  for (const [key, val] of Object.entries(rawRecord)) {
    if (!ALLOWED_USER_KEYS.has(key) || val === undefined) continue;
    sanitized[key] = val;
  }

  sanitized.uid = uid;
  sanitized.email = cleanEmail;
  sanitized.name = cleanName;
  sanitized.age = typeof rawUser.age === 'string' ? rawUser.age.trim().slice(0, 20) : '';
  sanitized.phone = resolveCustomerPhoneUsed(rawUser).slice(0, 60);
  sanitized.role =
    cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase()
      ? 'admin'
      : rawUser.role === 'admin'
      ? 'admin'
      : 'client';
  sanitized.createdAt =
    typeof rawUser.createdAt === 'number' && rawUser.createdAt > 0
      ? rawUser.createdAt
      : Date.now();
  sanitized.firstEntryAt =
    typeof rawUser.firstEntryAt === 'number' && rawUser.firstEntryAt > 0
      ? rawUser.firstEntryAt
      : sanitized.createdAt;
  sanitized.periods = realPeriods;

  if (Array.isArray(rawUser.entryHistory)) {
    sanitized.entryHistory = rawUser.entryHistory.slice(0, 60).map((eh) => {
      const { ...rest } = eh as CustomerEntryRecord & { password?: string };
      delete (rest as { password?: string }).password;
      return rest;
    });
  }

  return cleanFirestorePayload(sanitized);
}

export async function loadUserDocByUid(uid: string): Promise<UserData | null> {
  if (!uid || !isCurrentUserVerified()) return null;
  const path = `bloomcampus_users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'bloomcampus_users', uid));
    if (!snap.exists()) return null;
    const raw = snap.data() as Record<string, unknown>;
    lastKnownUserDocCache.set(uid, cleanFirestorePayload(raw));
    return normalizeLoadedUserDoc(uid, raw);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

function normalizeLoadedUserDoc(docId: string, raw: Record<string, unknown>): UserData {
  const userObj = { ...(raw as unknown as UserData) };
  delete (userObj as unknown as Record<string, unknown>).password;
  userObj.uid = typeof raw.uid === 'string' && raw.uid ? raw.uid : docId;
  userObj.email = String(userObj.email || '').trim().toLowerCase();
  userObj.periods = Array.isArray(userObj.periods)
    ? userObj.periods.filter((p) => p && !p.autoGenerated)
    : [];
  userObj.dailyLogs = userObj.dailyLogs && typeof userObj.dailyLogs === 'object' ? userObj.dailyLogs : {};
  userObj.emergencyPills = Array.isArray(userObj.emergencyPills) ? userObj.emergencyPills : [];
  return userObj;
}

export function subscribeToUserDocByUid(
  uid: string,
  onUpdate: (user: UserData | null) => void,
  onError?: (err: unknown) => void
): () => void {
  if (!uid || !isCurrentUserVerified()) return () => {};
  const path = `bloomcampus_users/${uid}`;
  return onSnapshot(
    doc(db, 'bloomcampus_users', uid),
    (snap) => {
      if (!snap.exists()) {
        lastKnownUserDocCache.delete(uid);
        onUpdate(null);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      lastKnownUserDocCache.set(uid, cleanFirestorePayload(raw));
      onUpdate(normalizeLoadedUserDoc(uid, raw));
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function saveUserDocByUid(
  uid: string,
  userData: UserData,
  options?: {
    action?: 'create' | 'normal' | 'pending_payment' | 'free_code' | 'admin';
  }
): Promise<void> {
  if (!uid || !isCurrentUserVerified()) return;
  const path = `bloomcampus_users/${uid}`;
  const isAdminCaller = isCurrentUserOwnerAdmin();
  const payload = sanitizeUserForFirestore(uid, userData);

  let existingRaw = lastKnownUserDocCache.get(uid);
  if (!existingRaw) {
    try {
      const snap = await getDoc(doc(db, 'bloomcampus_users', uid));
      if (snap.exists()) {
        existingRaw = snap.data() as Record<string, unknown>;
        lastKnownUserDocCache.set(uid, cleanFirestorePayload(existingRaw));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  if (!existingRaw) {
    // CREATE path: obey isSafeSelfCreateUser when caller is non-admin client
    if (!isAdminCaller) {
      payload.role = 'client';
      payload.isVip = false;
      payload.usedFreeAccessPassword = false;
      payload.subscriptionStatus = 'active';
      const maxAllowedTrialEnd = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (
        typeof payload.subscriptionUntil !== 'number' ||
        payload.subscriptionUntil > maxAllowedTrialEnd
      ) {
        payload.subscriptionUntil = maxAllowedTrialEnd;
      }
      delete payload.submittedFreeCode;
    }
    try {
      await setDoc(doc(db, 'bloomcampus_users', uid), payload);
      lastKnownUserDocCache.set(uid, cleanFirestorePayload(payload));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
    return;
  }

  // UPDATE path: preserve immutable fields & enforce Action 1/2/3 boundaries
  if (!isAdminCaller && options?.action !== 'admin') {
    payload.uid = existingRaw.uid || uid;
    payload.email = existingRaw.email || payload.email;
    payload.createdAt = existingRaw.createdAt || payload.createdAt;
    if ('role' in existingRaw) {
      payload.role = existingRaw.role;
    } else {
      delete payload.role;
    }

    const action = options?.action || 'normal';
    if (action === 'pending_payment') {
      // Action 2 allows ONLY ['phone', 'paymentMethod', 'pendingPayment', 'subscriptionStatus', 'lastUpdatedAt'] to change
      const merged = cleanFirestorePayload(existingRaw);
      merged.phone = payload.phone;
      merged.paymentMethod = payload.paymentMethod ?? null;
      merged.pendingPayment = payload.pendingPayment ?? null;
      merged.subscriptionStatus = 'pending_verification';
      merged.lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
      try {
        await setDoc(doc(db, 'bloomcampus_users', uid), merged);
        lastKnownUserDocCache.set(uid, cleanFirestorePayload(merged));
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
      return;
    }

    if (action === 'free_code') {
      // Action 3 allows ONLY ['isVip', 'usedFreeAccessPassword', 'subscriptionStatus', 'subscriptionUntil', 'paymentMethod', 'pendingPayment', 'submittedFreeCode', 'lastUpdatedAt']
      const merged = cleanFirestorePayload(existingRaw);
      merged.isVip = true;
      merged.usedFreeAccessPassword = true;
      merged.subscriptionStatus = 'free_password';
      const maxOneMonthEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;
      merged.subscriptionUntil =
        typeof payload.subscriptionUntil === 'number'
          ? Math.min(payload.subscriptionUntil, maxOneMonthEnd)
          : maxOneMonthEnd;
      merged.paymentMethod = payload.paymentMethod || '1-Month Free Pass Code';
      merged.pendingPayment = null;
      merged.submittedFreeCode = payload.submittedFreeCode || '';
      merged.lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
      try {
        await setDoc(doc(db, 'bloomcampus_users', uid), merged);
        lastKnownUserDocCache.set(uid, cleanFirestorePayload(merged));
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
      return;
    }

    // Action 1: Normal update — preserve all protected subscription/privilege keys exactly as stored
    const protectedKeys = [
      'isVip',
      'subscriptionUntil',
      'subscriptionStatus',
      'usedFreeAccessPassword',
      'paymentMethod',
      'pendingPayment',
      'submittedFreeCode',
    ] as const;
    for (const pk of protectedKeys) {
      if (pk in existingRaw) {
        payload[pk] = existingRaw[pk];
      } else {
        delete payload[pk];
      }
    }
  } else {
    if (!('submittedFreeCode' in existingRaw) && payload.submittedFreeCode === undefined) {
      delete payload.submittedFreeCode;
    }
  }

  try {
    await setDoc(doc(db, 'bloomcampus_users', uid), payload);
    lastKnownUserDocCache.set(uid, cleanFirestorePayload(payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function logCustomerEntryToFirestore(
  user: UserData,
  entryType: CustomerEntryRecord['entryType'] = 'Sign In'
): Promise<void> {
  const uid = user.uid || auth.currentUser?.uid;
  if (!uid || !isCurrentUserVerified()) return;
  const entryId = toSafeRuleId(`entry_${uid}_${Date.now()}`, 'entry');
  const path = `bloomcampus_entries/${entryId}`;
  const nowTs = Date.now();
  const payload = cleanFirestorePayload({
    id: entryId,
    userId: uid,
    customerNumber: user.customerNumber || 1,
    name: (user.name || user.email.split('@')[0] || 'Student').slice(0, 200),
    email: user.email.trim().toLowerCase().slice(0, 254),
    age: (user.age || '').slice(0, 20),
    phone: resolveCustomerPhoneUsed(user).slice(0, 60),
    role: user.role === 'admin' ? 'admin' : 'client',
    entryType: String(entryType).slice(0, 60),
    deviceInfo: (user.deviceInfo || getClientDeviceLabel()).slice(0, 200),
    appUrl:
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`.slice(0, 300)
        : '',
    firstEntryAt: user.firstEntryAt || user.createdAt || nowTs,
    timestamp: nowTs,
    timestampIso: new Date(nowTs).toISOString(),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_entries', entryId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function syncUserToFirestore(
  user: UserData,
  _fallbackEmail?: string
): Promise<void> {
  const targetUid = user.uid || (isCurrentUserOwnerAdmin() ? undefined : auth.currentUser?.uid);
  if (!targetUid) return;
  await saveUserDocByUid(targetUid, user, {
    action: isCurrentUserOwnerAdmin() ? 'admin' : 'normal',
  });
}

export async function syncAllUsersToFirestore(
  usersMap: Record<string, UserData>
): Promise<void> {
  if (!isCurrentUserOwnerAdmin()) return;
  const entries = Object.values(usersMap || {});
  for (const u of entries) {
    if (u?.uid) {
      await saveUserDocByUid(u.uid, u, { action: 'admin' });
    }
  }
}

export async function fetchAllUsersFromFirestore(): Promise<Record<string, UserData>> {
  if (!isCurrentUserOwnerAdmin()) return {};
  const path = 'bloomcampus_users';
  try {
    const snap = await getDocs(collection(db, 'bloomcampus_users'));
    const rawMap: Record<string, UserData> = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      lastKnownUserDocCache.set(docSnap.id, cleanFirestorePayload(data));
      const userObj = normalizeLoadedUserDoc(docSnap.id, data);
      if (userObj.email) {
        rawMap[userObj.email] = userObj;
      }
    });
    return assignSequentialCustomerNumbers(rawMap);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function deleteUserFromFirestore(emailOrUid: string): Promise<void> {
  const clean = emailOrUid.trim().toLowerCase();
  if (!clean) return;
  markEmailDeletedLocally(clean);

  if (!isCurrentUserVerified()) return;

  if (isCurrentUserOwnerAdmin()) {
    const path = 'bloomcampus_users';
    try {
      const snap = await getDocs(collection(db, 'bloomcampus_users'));
      const batch = writeBatch(db);
      let count = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const docEmail = String(data.email || '').trim().toLowerCase();
        if (docSnap.id === emailOrUid.trim() || docEmail === clean) {
          batch.delete(docSnap.ref);
          lastKnownUserDocCache.delete(docSnap.id);
          count++;
        }
      });
      if (count > 0) await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  } else if (auth.currentUser && auth.currentUser.email?.trim().toLowerCase() === clean) {
    const uid = auth.currentUser.uid;
    try {
      await deleteDoc(doc(db, 'bloomcampus_users', uid));
      lastKnownUserDocCache.delete(uid);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bloomcampus_users/${uid}`);
    }
  }
}

export async function deleteMultipleUsersFromFirestore(emails: string[]): Promise<void> {
  const cleaned = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return;
  markEmailDeletedLocally(cleaned);

  if (!isCurrentUserOwnerAdmin()) return;
  const emailSet = new Set(cleaned);
  const path = 'bloomcampus_users';
  try {
    const snap = await getDocs(collection(db, 'bloomcampus_users'));
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const docEmail = String(data.email || '').trim().toLowerCase();
      if (emailSet.has(docEmail) || emailSet.has(docSnap.id.toLowerCase())) {
        batch.delete(docSnap.ref);
        lastKnownUserDocCache.delete(docSnap.id);
        count++;
      }
    });
    if (count > 0) await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeToAllUsersFirestore(
  onUpdate: (users: Record<string, UserData>) => void
): () => void {
  if (!isCurrentUserOwnerAdmin()) return () => {};
  const path = 'bloomcampus_users';
  return onSnapshot(
    collection(db, 'bloomcampus_users'),
    (snap) => {
      const rawMap: Record<string, UserData> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        lastKnownUserDocCache.set(docSnap.id, cleanFirestorePayload(data));
        const userObj = normalizeLoadedUserDoc(docSnap.id, data);
        if (userObj.email) {
          rawMap[userObj.email] = userObj;
        }
      });
      onUpdate(assignSequentialCustomerNumbers(rawMap));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function syncAdminConfigToFirestore(cfg: AdminConfig): Promise<void> {
  if (!isCurrentUserOwnerAdmin()) return;
  const path = 'bloomcampus_config/settings';
  const payload = cleanFirestorePayload({
    ownerEmail: cfg.ownerEmail || OWNER_ADMIN_EMAIL,
    adminPassword: cfg.adminPassword || '',
    freeAccessPassword: cfg.freeAccessPassword || '',
    additionalAdmins: Array.isArray(cfg.additionalAdmins) ? cfg.additionalAdmins.slice(0, 25) : [],
    updatedAt: cfg.updatedAt || new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_config', 'settings'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchAdminConfigFromFirestore(): Promise<AdminConfig | null> {
  if (!isCurrentUserOwnerAdmin()) return null;
  const path = 'bloomcampus_config/settings';
  try {
    const snap = await getDoc(doc(db, 'bloomcampus_config', 'settings'));
    if (!snap.exists()) return null;
    return snap.data() as AdminConfig;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeToAdminConfigFirestore(
  onUpdate: (cfg: AdminConfig) => void
): () => void {
  if (!isCurrentUserOwnerAdmin()) return () => {};
  const path = 'bloomcampus_config/settings';
  return onSnapshot(
    doc(db, 'bloomcampus_config', 'settings'),
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as AdminConfig);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function syncSupportInquiryToFirestore(inq: SupportInquiry): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !isCurrentUserVerified()) return;
  const safeId = toSafeRuleId(inq.id, 'inq');
  const path = `bloomcampus_inquiries/${safeId}`;
  const payload = cleanFirestorePayload({
    id: safeId,
    userId: uid,
    userName: (inq.userName || 'BloomCampus Client').slice(0, 200),
    userEmail: (inq.userEmail || '').trim().toLowerCase().slice(0, 254),
    userPhone: (inq.userPhone || '').slice(0, 60),
    userAge: (inq.userAge || '').slice(0, 20),
    deviceInfo: (inq.deviceInfo || getClientDeviceLabel()).slice(0, 200),
    subject: (inq.subject || 'Inquiry').slice(0, 300),
    message: (inq.message || '').slice(0, 5000),
    type: inq.type,
    createdAt: inq.createdAt || new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_inquiries', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function syncClientAppointmentToFirestore(
  userEmail: string,
  userName: string,
  appointment: SidratuAppointment,
  explicitUid?: string
): Promise<void> {
  const uid = explicitUid || auth.currentUser?.uid;
  if (!uid || !isCurrentUserVerified()) return;
  const safeId = toSafeRuleId(appointment.id, 'appt');
  const path = `bloomcampus_appointments/${safeId}`;
  const payload = cleanFirestorePayload({
    id: safeId,
    userId: uid,
    userEmail: (userEmail || '').trim().toLowerCase().slice(0, 254),
    userName: (userName || '').slice(0, 200),
    treatmentType: (appointment.treatmentType || '').slice(0, 200),
    requestedDate: (appointment.requestedDate || '').slice(0, 32),
    requestedTime: (appointment.requestedTime || '').slice(0, 32),
    notes: (appointment.notes || '').slice(0, 1000),
    status: appointment.status === 'Confirmed' ? 'Confirmed' : 'Pending',
    createdAt: appointment.createdAt || new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_appointments', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncClientSkincareLogToFirestore(
  userEmail: string,
  log: TherapySessionLog,
  explicitUid?: string
): Promise<void> {
  const uid = explicitUid || auth.currentUser?.uid;
  if (!uid || !isCurrentUserVerified()) return;
  const safeId = toSafeRuleId(log.id, 'skinlog');
  const path = `bloomcampus_skincare_logs/${safeId}`;
  const payload = cleanFirestorePayload({
    id: safeId,
    userId: uid,
    userEmail: (userEmail || '').trim().toLowerCase().slice(0, 254),
    treatmentType: (log.treatmentType || '').slice(0, 200),
    sessionDate: (log.sessionDate || '').slice(0, 32),
    postSessionFeeling: (log.postSessionFeeling || '').slice(0, 2000),
    ...(log.stageAtSession ? { stageAtSession: String(log.stageAtSession).slice(0, 64) } : {}),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_skincare_logs', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSupportInquiryFromFirestore(id: string): Promise<void> {
  if (!isCurrentUserOwnerAdmin() || !id) return;
  const safeId = toSafeRuleId(id, 'inq');
  const path = `bloomcampus_inquiries/${safeId}`;
  try {
    await deleteDoc(doc(db, 'bloomcampus_inquiries', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllSupportInquiriesFromFirestore(): Promise<void> {
  if (!isCurrentUserOwnerAdmin()) return;
  const path = 'bloomcampus_inquiries';
  try {
    const snap = await getDocs(collection(db, 'bloomcampus_inquiries'));
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    if (count > 0) await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeToSupportInquiriesFirestore(
  onUpdate: (inquiries: SupportInquiry[]) => void
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid || !isCurrentUserVerified()) return () => {};
  const path = 'bloomcampus_inquiries';
  const q = isCurrentUserOwnerAdmin()
    ? query(collection(db, 'bloomcampus_inquiries'), orderBy('createdAt', 'desc'))
    : query(collection(db, 'bloomcampus_inquiries'), where('userId', '==', uid));

  return onSnapshot(
    q,
    (snap) => {
      const list: SupportInquiry[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as SupportInquiry;
        if (data && data.id) {
          list.push(data);
        }
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onUpdate(list.slice(0, 200));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export interface CommunityCommentRecord {
  id: string;
  userId: string;
  userName: string;
  commentText: string;
  stageTag?: string;
  treatmentTag?: string;
  createdAt: string;
}

export function subscribeToCommunityCommentsFirestore(
  onUpdate: (comments: CommunityCommentRecord[]) => void
): () => void {
  if (!isCurrentUserVerified()) return () => {};
  const path = 'bloomcampus_comments';
  const q = query(collection(db, 'bloomcampus_comments'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: CommunityCommentRecord[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as CommunityCommentRecord;
        if (data && typeof data.commentText === 'string' && typeof data.userName === 'string') {
          list.push(data);
        }
      });
      onUpdate(list.slice(0, 100));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function postCommunityCommentToFirestore(comment: {
  userName: string;
  commentText: string;
  stageTag?: string;
  treatmentTag?: string;
}): Promise<CommunityCommentRecord | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || !isCurrentUserVerified()) return null;
  const safeId = toSafeRuleId(`cmt_${uid}_${Date.now()}`, 'cmt');
  const path = `bloomcampus_comments/${safeId}`;
  const payload: CommunityCommentRecord = {
    id: safeId,
    userId: uid,
    userName: (comment.userName || 'Sidratu Client').trim().slice(0, 200),
    commentText: comment.commentText.trim().slice(0, 1000),
    ...(comment.stageTag ? { stageTag: comment.stageTag.slice(0, 64) } : {}),
    ...(comment.treatmentTag ? { treatmentTag: comment.treatmentTag.slice(0, 120) } : {}),
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'bloomcampus_comments', safeId), cleanFirestorePayload(payload));
    return payload;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function fetchSingleUserFromFirestore(uidOrEmail: string): Promise<UserData | null> {
  if (!isCurrentUserVerified()) return null;
  if (auth.currentUser && (uidOrEmail === auth.currentUser.uid || uidOrEmail.trim().toLowerCase() === auth.currentUser.email?.trim().toLowerCase())) {
    return loadUserDocByUid(auth.currentUser.uid);
  }
  return null;
}
