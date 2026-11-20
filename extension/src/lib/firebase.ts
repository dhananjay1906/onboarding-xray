// Firebase init for the extension: app + App Check. (AI Logic, Firestore, Auth and Remote Config come later.)
import { appCheckDebug } from "./appCheckDebug"; // keep first: sets the debug flag before the SDK loads
import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

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
