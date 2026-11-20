// Enables the App Check debug provider. This module must be imported BEFORE any firebase/* module:
// the SDK reads self.FIREBASE_APPCHECK_DEBUG_TOKEN when it loads.
//
// Debug mode is on for development builds (`npm run dev`, `npm run build:dev`), or when
// VITE_APPCHECK_DEBUG=true, or when VITE_APPCHECK_DEBUG_TOKEN is set. With `true` the SDK generates a
// token once, stores it in this extension's IndexedDB and prints it to the console:
//   "App Check debug token: <uuid>. You will need to add it to your app's App Check settings ..."

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

const env = import.meta.env;
const fixedToken: string | undefined = env.VITE_APPCHECK_DEBUG_TOKEN || undefined;

export const appCheckDebug: boolean =
  env.MODE === "development" || env.VITE_APPCHECK_DEBUG === "true" || !!fixedToken;

if (appCheckDebug) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = fixedToken ?? true;
}
