// Enables the App Check debug provider. This module must be imported BEFORE any firebase/* module:
// the SDK reads self.FIREBASE_APPCHECK_DEBUG_TOKEN when it loads.
//
// Debug mode is always on: reCAPTCHA cannot run inside an extension (Manifest V3 blocks its remote script),
// so there is no other App Check provider.
//  - Submission build (`--mode submission`): the debug token is injected at build time from the
//    XRAY_APPCHECK_DEBUG_TOKEN environment variable (see vite.config.ts). It is never in the repo.
//  - Every other build: the SDK generates a token (or uses VITE_APPCHECK_DEBUG_TOKEN if set) and prints it
//    to the console: "Firebase App Check debug token: <uuid>"
//
// Only static `import.meta.env.X` reads are used here: Vite inlines every VITE_ variable in the bundle
// if code reads `import.meta.env` as a whole object.

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

/** Replaced at build time (vite.config.ts `define`). Empty string outside submission builds. */
declare const __XRAY_APPCHECK_DEBUG_TOKEN__: string;

export const isSubmissionBuild: boolean = import.meta.env.MODE === "submission";

const fixedToken: string | undefined = isSubmissionBuild
  ? __XRAY_APPCHECK_DEBUG_TOKEN__ || undefined
  : import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || undefined;

export const appCheckDebug = true;

self.FIREBASE_APPCHECK_DEBUG_TOKEN = fixedToken ?? true;
