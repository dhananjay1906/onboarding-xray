// Where the guided first run sends people.
/** The hosted demo store (Firebase Hosting default URL for this project). */
export const DEMO_URL = "https://onboarding-xray.web.app";
/** The demo store running locally (see demo-app/README.md). */
export const LOCAL_DEMO_URL = "http://localhost:5173";

/** Opens the welcome page / tour in a new tab. Works inside the extension and, for testing, on a static server. */
export function openTour(): void {
  const url = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("welcome.html") : new URL("welcome.html", location.href).href;
  if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url });
  else window.open(url, "_blank");
}
