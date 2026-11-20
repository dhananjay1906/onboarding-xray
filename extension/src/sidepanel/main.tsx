import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "../styles.css";
import { getFirebase } from "../lib/firebase";
import App from "./App";

// Start App Check as soon as the panel opens. In debug builds this prints the debug token to the console.
try {
  getFirebase();
} catch (e) {
  console.error("[X-Ray] Firebase not initialised:", (e as Error).message);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
