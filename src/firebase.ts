import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AdminConfig, SupportInquiry, UserData } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestoreWithDatabaseId();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

import { getFirestore } from 'firebase/firestore';
function getFirestoreWithDatabaseId() {
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

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

export function prepareUserForFirestore(user: UserData, fallbackEmail?: string): UserData | null {
  const emailClean = (user?.email || fallbackEmail || '').trim().toLowerCase().slice(0, 254);
  if (!emailClean || emailClean.length < 3) return null;
  const nameClean = (user?.name || emailClean.split('@')[0] || 'Student').trim().slice(0, 200);
  const cleaned = cleanFirestorePayload({
    ...user,
    email: emailClean,
    name: nameClean || 'Student',
    createdAt: Number(user?.createdAt) > 0 ? Number(user.createdAt) : Date.now(),
    lastUpdatedAt: user?.lastUpdatedAt || new Date().toISOString(),
  });
  return cleaned;
}

export async function syncUserToFirestore(user: UserData, fallbackEmail?: string): Promise<void> {
  const prepared = prepareUserForFirestore(user, fallbackEmail);
  if (!prepared) return;
  const docId = emailToDocId(prepared.email);
  const path = `bloomcampus_users/${docId}`;
  try {
    await setDoc(doc(db, 'bloomcampus_users', docId), prepared, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncAllUsersToFirestore(
  usersMap: Record<string, UserData>
): Promise<void> {
  const entries = Object.entries(usersMap || {});
  for (const [key, u] of entries) {
    if (!u || typeof u !== 'object') continue;
    const prepared = prepareUserForFirestore(u, key);
    if (!prepared) continue;
    const docId = emailToDocId(prepared.email);
    try {
      await setDoc(doc(db, 'bloomcampus_users', docId), prepared, { merge: true });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `bloomcampus_users/${docId}`);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  }
}

export async function fetchAllUsersFromFirestore(): Promise<Record<string, UserData>> {
  const path = 'bloomcampus_users';
  try {
    const snap = await getDocs(collection(db, path));
    const result: Record<string, UserData> = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() as UserData;
      if (data && data.email) {
        result[data.email.trim().toLowerCase()] = data;
      }
    });
    return result;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return {};
    }
  }
}

export async function deleteUserFromFirestore(email: string): Promise<void> {
  const docId = emailToDocId(email);
  const path = `bloomcampus_users/${docId}`;
  try {
    await deleteDoc(doc(db, 'bloomcampus_users', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToAllUsersFirestore(
  onUpdate: (users: Record<string, UserData>) => void
): () => void {
  const path = 'bloomcampus_users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const users: Record<string, UserData> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserData;
        if (data && typeof data.email === 'string') {
          const emailKey = data.email.trim().toLowerCase();
          users[emailKey] = data;
        }
      });
      onUpdate(users);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export async function syncAdminConfigToFirestore(cfg: AdminConfig): Promise<void> {
  const path = 'bloomcampus_config/admin';
  const cleaned = cleanFirestorePayload({
    ownerEmail: (cfg.ownerEmail || 'abdulbobsonbaituray@gmail.com').slice(0, 254),
    adminPassword: (cfg.adminPassword || '@Haizen565.').slice(0, 200),
    freeAccessPassword: (cfg.freeAccessPassword || 'Bobson@565').slice(0, 200),
    additionalAdmins: Array.isArray(cfg.additionalAdmins) ? cfg.additionalAdmins : [],
    updatedAt: cfg.updatedAt || new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_config', 'admin'), cleaned, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAdminConfigFromFirestore(): Promise<AdminConfig | null> {
  const path = 'bloomcampus_config/admin';
  try {
    const snap = await getDoc(doc(db, 'bloomcampus_config', 'admin'));
    if (snap.exists()) {
      return snap.data() as AdminConfig;
    }
    return null;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch {
      return null;
    }
  }
}

export function subscribeToAdminConfigFirestore(
  onUpdate: (cfg: AdminConfig) => void
): () => void {
  const path = 'bloomcampus_config/admin';
  return onSnapshot(
    doc(db, 'bloomcampus_config', 'admin'),
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as AdminConfig);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export async function syncSupportInquiryToFirestore(inq: SupportInquiry): Promise<void> {
  const docId = emailToDocId(inq.id || `inq-${Date.now()}`);
  const path = `bloomcampus_inquiries/${docId}`;
  const cleaned = cleanFirestorePayload({
    id: String(inq.id || docId).slice(0, 128),
    userName: String(inq.userName || 'Student').slice(0, 200),
    userEmail: String(inq.userEmail || 'student@campus.edu').slice(0, 254),
    userPhone: inq.userPhone ? String(inq.userPhone).slice(0, 60) : '',
    subject: String(inq.subject || 'Inquiry').slice(0, 300),
    message: String(inq.message || '').slice(0, 5000),
    type: inq.type === 'payment' ? 'payment' : 'support',
    createdAt: String(inq.createdAt || new Date().toISOString()).slice(0, 64),
  });
  try {
    await setDoc(doc(db, 'bloomcampus_inquiries', docId), cleaned, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToSupportInquiriesFirestore(
  onUpdate: (inquiries: SupportInquiry[]) => void
): () => void {
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
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export async function signInWithGooglePopup() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}
