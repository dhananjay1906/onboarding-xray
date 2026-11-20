import { useCallback, useEffect, useState } from "react";
import { checkOnDevice, downloadOnDeviceModel, type OnDeviceState } from "../lib/onDevice";

/** On-device model status for the status pill, plus the user-triggered download. */
export function useOnDevice() {
  const [state, setState] = useState<OnDeviceState>("unavailable");
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // 0..1 while our own download runs
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState(await checkOnDevice());
    setChecked(true);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Chrome may be downloading for another reason (or after a reload): keep polling until it finishes.
  useEffect(() => {
    if (state !== "downloading") return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [state, refresh]);

  const download = useCallback(async () => {
    setError(null);
    setProgress(0);
    try {
      await downloadOnDeviceModel(setProgress); // called straight from a click: Chrome needs the user gesture
    } catch (e) {
      setError((e as Error).message || "The download failed.");
    } finally {
      setProgress(null);
      await refresh();
    }
  }, [refresh]);

  return { state, checked, progress, error, download, refresh };
}
