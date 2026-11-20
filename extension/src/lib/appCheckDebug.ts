// Enables the App Check debug provider. This module must be imported BEFORE any firebase/* module:
// the SDK reads self.FIREBASE_APPCHECK_DEBUG_TOKEN when it loads.
//
// Three cases:
//  - Submission build (`--mode submission`): the debug token is injected at build time from the
//    XRAY_APPCHECK_DEBUG_TOKEN environment variable (see vite.config.ts). It is never in the repo.
//  - Development builds (`npm run dev`, `npm run build:dev`), or VITE_APPCHECK_DEBUG=true, or
//    VITE_APPCHECK_DEBUG_TOKEN set: the SDK generates (or uses) a token and prints it to the console:
//      "Firebase App Check debug token: <uuid>"
//  - Otherwise (plain `npm run build`): debug mode is off.
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

export const appCheckDebug: boolean =
  isSubmissionBuild ||
  import.meta.env.MODE === "development" ||
  import.meta.env.VITE_APPCHECK_DEBUG === "true" ||
  !!fixedToken;

if (appCheckDebug) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = fixedToken ?? true;
}
