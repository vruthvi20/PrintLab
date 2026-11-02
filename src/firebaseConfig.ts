import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  collection, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  runTransaction 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import appletConfig from '../firebase-applet-config.json';

// Configuration object with fallbacks and placeholders
export const firebaseConfig = {
  projectId: appletConfig.projectId || 'excellent-burner-gbcxw',
  appId: appletConfig.appId || '1:17668671135:web:dab06b8fec2ea10b3d44aa',
  apiKey: appletConfig.apiKey || 'AIzaSyCqNItDikqlFwphwsyFMZbun7j_IMz2PFI',
  authDomain: appletConfig.authDomain || 'excellent-burner-gbcxw.firebaseapp.com',
  firestoreDatabaseId: appletConfig.firestoreDatabaseId || 'ai-studio-04bdbc13-f2d3-42ec-900b-93e5bf47a3f6',
  storageBucket: appletConfig.storageBucket || 'excellent-burner-gbcxw.firebasestorage.app',
  messagingSenderId: appletConfig.messagingSenderId || '17668671135',
};

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== 'AIzaSy_YOUR_API_KEY_HERE'
  );
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with designated database ID (critical for enterprise/custom instance)
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Authentication
export const auth = getAuth(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Connection test as required by Firebase skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'settings', 'connection-test'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Verify network connectivity.');
      return false;
    }
    // Any other response (including document not found or permission check) means connection to Firebase servers succeeded
    return true;
  }
}

// Structured error handling matching FirestoreErrorInfo specification
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
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
