// Remote Config loader. Values and validation live in settingsCore.ts.
import { fetchAndActivate, getRemoteConfig, getString } from "firebase/remote-config";
import { getFirebase } from "./firebase";
import { DEFAULT_SETTINGS, parseSettings, REMOTE_KEYS, type Settings } from "./settingsCore";

export { DEFAULT_SETTINGS, type Settings };

let current: Settings = DEFAULT_SETTINGS;
let loading: Promise<Settings> | null = null;

export const getSettings = (): Settings => current;

/** Fetches Remote Config once per session. Any failure keeps the defaults. */
export function loadSettings(): Promise<Settings> {
  loading ??= (async () => {
    try {
      const rc = getRemoteConfig(getFirebase().app);
      rc.defaultConfig = {
        [REMOTE_KEYS.onDeviceMaxChars]: String(DEFAULT_SETTINGS.onDeviceMaxChars),
        [REMOTE_KEYS.promptVersion]: DEFAULT_SETTINGS.promptVersion,
        [REMOTE_KEYS.defaultMode]: DEFAULT_SETTINGS.defaultMode,
        [REMOTE_KEYS.cloudModel]: DEFAULT_SETTINGS.cloudModel,
      };
      rc.settings.fetchTimeoutMillis = 5000;
      rc.settings.minimumFetchIntervalMillis = import.meta.env.MODE === "development" ? 0 : 60 * 60 * 1000;
      await fetchAndActivate(rc);
      current = parseSettings((k) => getString(rc, k) || undefined);
    } catch (e) {
      console.warn("[X-Ray] Remote Config unavailable, using defaults:", (e as Error).message);
    }
    return current;
  })();
  return loading;
}
