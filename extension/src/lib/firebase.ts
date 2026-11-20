// Firebase init for the extension: app, App Check, anonymous Auth and Firestore.
// (AI Logic lives in firebaseModel.ts, Remote Config in settings.ts.)
import { appCheckDebug } from "./appCheckDebug"; // keep first: sets the debug flag before the SDK loads
import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { indexedDBLocalPersistence, initializeAuth, signInAnonymously, type Auth } from "firebase/auth/web-extension";
import { getFirestore, type Firestore } from "firebase/firestore";

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
};

const siteKey: string | undefined = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;

export interface Firebase {
  app: FirebaseApp;
  appCheck: AppCheck;
  appCheckDebug: boolean;
}

let auth: Auth | null = null;
let signIn: Promise<void> | null = null;

/**
 * Anonymous sign-in, done lazily the first time the shared cache is needed (never in Private only mode).
 * Uses the web-extension build of Auth, which does not load remote scripts (Manifest V3 forbids them).
 */
export function ensureSignedIn(): Promise<void> {
  signIn ??= (async () => {
    const { app } = getFirebase();
    auth ??= initializeAuth(app, { persistence: indexedDBLocalPersistence });
    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
  })().catch((e) => {
    signIn = null; // allow a retry on the next call
    throw e;
  });
  return signIn;
}

export const getDb = (): Firestore => getFirestore(getFirebase().app);

let instance: Firebase | null = null;

/** Create the Firebase app and App Check once. Throws a clear error when .env values are missing. */
export function getFirebase(): Firebase {
  if (instance) return instance;

  const missing = [
    ...Object.entries(config).filter(([, v]) => !v).map(([k]) => `VITE_FIREBASE_${k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()}`),
    ...(siteKey ? [] : ["VITE_RECAPTCHA_ENTERPRISE_SITE_KEY"]),
  ];
  if (missing.length) {
    throw new Error(`Missing in .env: ${missing.join(", ")}. Copy .env.example to .env and fill the values, then rebuild.`);
  }

  const app = initializeApp(config);
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey!),
    isTokenAutoRefreshEnabled: true,
  });
  instance = { app, appCheck, appCheckDebug };
  return instance;
}
