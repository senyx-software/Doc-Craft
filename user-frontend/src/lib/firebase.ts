import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, inMemoryPersistence, setPersistence, signInWithPopup, signOut } from 'firebase/auth';

const app = initializeApp({
  // Firebase web client configuration is public; backend verifies Firebase ID tokens.
  apiKey: 'AIzaSyBwMVjcVrN6gzFsO63Lsnx4CgDa66bwL9w', // gitleaks:allow -- public Firebase web identifier; restrict authorized domains/API access
  authDomain: 'doc-craft-57643.firebaseapp.com',
  projectId: 'doc-craft-57643',
  storageBucket: 'doc-craft-57643.firebasestorage.app',
  messagingSenderId: '539898474428',
  appId: '1:539898474428:web:833b1d2b60dcb2daec45b9',
  measurementId: 'G-JQTNHHV0LV',
});
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const persistenceReady = setPersistence(auth, inMemoryPersistence);

export async function getGoogleIdToken(): Promise<string> {
  await persistenceReady;
  const result = await signInWithPopup(auth, provider);
  try { return await result.user.getIdToken(); }
  finally { await signOut(auth); }
}

export function googleSignInError(error: unknown): string | null {
  const code = (error as { code?: string })?.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (code === 'auth/popup-blocked') return 'Please allow popups for this site and try Google sign-in again.';
  if (code === 'auth/unauthorized-domain') return 'Google sign-in is not enabled for this website domain yet.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled yet. Please use email sign-in.';
  if (code === 'auth/network-request-failed') return 'Could not connect to Google. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Google sign-in failed. Please try again.';
}
