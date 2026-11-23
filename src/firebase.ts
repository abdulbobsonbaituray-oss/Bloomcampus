// Import the functions you need from the SDKs you need
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
  AdminConfig,
  CustomerEntryRecord,
  SidratuAppointment,
  SupportInquiry,
  TherapySessionLog,
  UserData,
} from './types';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: 'AIzaSyC1F4DtOfObpahsBxh0ZdihuuvU5pATH9k',
  authDomain: 'bloomcampus-12b5e.firebaseapp.com',
  projectId: 'bloomcampus-12b5e',
  storageBucket: 'bloomcampus-12b5e.firebasestorage.app',
  messagingSenderId: '972693603163',
  appId: '1:972693603163:web:af4f61d64ad6798e8f907e',
  measurementId: 'G-MVEKRCVYZX',
};

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
export const googleProvider = new GoogleAuthProvider();

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
// FIREBASE AUTHENTICATION FUNCTIONS ONLY (NO FIRESTORE / NO STORAGE / NO DB)
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
    // Do NOT auto-login after sign up: sign out immediately after sending verification email
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
        // Do NOT auto-login on sign up
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
      // Block login if email is not verified (user can click "Resend Verification Email" on the persistent banner)
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

// ============================================================================
// NO-OP STUBS (Firestore & Storage disabled per user request)
// ============================================================================

export async function logCustomerEntryToFirestore(
  _user: UserData,
  _entryType: CustomerEntryRecord['entryType'] = 'Sign In'
): Promise<void> {
  return;
}

export async function syncUserToFirestore(
  _user: UserData,
  _fallbackEmail?: string
): Promise<void> {
  return;
}

export async function syncAllUsersToFirestore(
  _usersMap: Record<string, UserData>
): Promise<void> {
  return;
}

export async function fetchAllUsersFromFirestore(): Promise<Record<string, UserData>> {
  return {};
}

export async function deleteUserFromFirestore(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  markEmailDeletedLocally(clean);
}

export async function deleteMultipleUsersFromFirestore(emails: string[]): Promise<void> {
  const cleaned = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return;
  markEmailDeletedLocally(cleaned);
}

export function subscribeToAllUsersFirestore(
  _onUpdate: (users: Record<string, UserData>) => void
): () => void {
  return () => {};
}

export async function syncAdminConfigToFirestore(_cfg: AdminConfig): Promise<void> {
  return;
}

export async function fetchAdminConfigFromFirestore(): Promise<AdminConfig | null> {
  return null;
}

export function subscribeToAdminConfigFirestore(
  _onUpdate: (cfg: AdminConfig) => void
): () => void {
  return () => {};
}

export async function syncSupportInquiryToFirestore(_inq: SupportInquiry): Promise<void> {
  return;
}

export async function syncClientAppointmentToFirestore(
  _userEmail: string,
  _userName: string,
  _appointment: SidratuAppointment
): Promise<void> {
  return;
}

export async function syncClientSkincareLogToFirestore(
  _userEmail: string,
  _log: TherapySessionLog
): Promise<void> {
  return;
}

export async function deleteSupportInquiryFromFirestore(_id: string): Promise<void> {
  return;
}

export function subscribeToSupportInquiriesFirestore(
  _onUpdate: (inquiries: SupportInquiry[]) => void
): () => void {
  return () => {};
}

export async function fetchSingleUserFromFirestore(_email: string): Promise<UserData | null> {
  return null;
}
