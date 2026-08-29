/**
 * Firebase client SDK setup for Google and email/password sign-in
 * (multitenant mode, #27, #28).
 *
 * Firebase config values (apiKey, authDomain, ...) are safe to ship in
 * client code - they identify the project, they don't authorize access by
 * themselves (see docs/7-DEVELOPMENT/research/firebase-project-selfhost-setup.md
 * #4) - so plain NEXT_PUBLIC_* env vars are the right fit, no secret
 * handling needed here.
 *
 * Nothing below runs at import time: the Firebase app/auth instance is only
 * created the first time one of these functions is actually called, so
 * importing this module has no effect in password-mode deployments that
 * never set these env vars.
 */

import { type FirebaseApp, getApps, initializeApp } from 'firebase/app'
import {
  type Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null

export function getFirebaseAuth(): Auth {
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig)
  }
  if (!authInstance) {
    authInstance = getAuth(app)
  }
  return authInstance
}

/**
 * Sign in with Google via a popup.
 *
 * signInWithPopup (not signInWithRedirect): Obo instances run on arbitrary,
 * operator-chosen domains/IPs, so authDomain stays Firebase's default
 * *.firebaseapp.com - a redirect flow would need the operator to either
 * reverse-proxy or self-host Firebase's auth-handler files on their own
 * domain. The popup flow avoids that requirement entirely (see
 * docs/7-DEVELOPMENT/research/firebase-project-selfhost-setup.md #5).
 *
 * Returns the Firebase ID token to send as the API bearer token.
 */
export async function signInWithGoogle(): Promise<string> {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(getFirebaseAuth(), provider)
  return result.user.getIdToken()
}

/**
 * Sign in to an existing email/password account.
 * Returns the Firebase ID token to send as the API bearer token.
 */
export async function signInWithEmail(email: string, password: string): Promise<string> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
  return result.user.getIdToken()
}

/**
 * Create a new email/password account.
 * Returns the Firebase ID token to send as the API bearer token.
 */
export async function signUpWithEmail(email: string, password: string): Promise<string> {
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password)
  return result.user.getIdToken()
}
