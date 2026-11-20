// Hold Alt to highlight the element under the cursor; Alt+click sends its source tag to the side panel.
import { SELECT_MESSAGE, type SelectMessage } from "../lib/messages";

let box: HTMLDivElement | null = null;
let lastTarget: Element | null = null;
let toastShown = false;

const STALE_MESSAGE = "X-Ray was updated — refresh this page to keep using it.";

/** False once the extension was reloaded or removed: this old script is orphaned and chrome.runtime is dead. */
function contextAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function isContextInvalidated(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /extension context invalidated/i.test(text);
}

/** One small, self-dismissing notice. Shown once per page load. */
function showStaleToast(): void {
  if (toastShown) return;
  toastShown = true;
  try {
    const toast = document.createElement("div");
    toast.setAttribute("data-xray-overlay", "");
    toast.setAttribute("role", "status");
    toast.textContent = STALE_MESSAGE;
    Object.assign(toast.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      maxWidth: "280px",
      padding: "10px 14px",
      borderRadius: "8px",
      background: "#1e293b",
      color: "#f8fafc",
      font: "13px/1.4 system-ui, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,.3)",
      zIndex: "2147483647",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  } catch {
    // Nothing sensible to do if the page blocks DOM changes.
  }
}

/** Remove every listener and the overlay, then tell the user once. Safe to call repeatedly. */
function retire(): void {
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("keyup", onKeyUp, true);
  document.removeEventListener("click", onClick, true);
  window.removeEventListener("blur", hide);
  box?.remove();
  box = null;
  lastTarget = null;
  showStaleToast();
}

/** Returns true when it is safe to use chrome.runtime; otherwise retires this script. */
function ensureAlive(): boolean {
  if (contextAlive()) return true;
  retire();
  return false;
}

function getBox(): HTMLDivElement {
  if (!box) {
    box = document.createElement("div");
    box.setAttribute("data-xray-overlay", "");
    Object.assign(box.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxSizing: "border-box",
      display: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(box);
  }
  return box;
}

function hide(): void {
  if (box) box.style.display = "none";
}

function show(el: Element): void {
  const rect = el.getBoundingClientRect();
  const traced = !!el.closest("[data-source]");
  const b = getBox();
  Object.assign(b.style, {
    display: "block",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    outline: traced ? "2px solid #6366f1" : "2px dashed #94a3b8",
    background: traced ? "rgba(99, 102, 241, 0.12)" : "rgba(148, 163, 184, 0.10)",
  });
}

function isOverlay(el: Element | null): boolean {
  return !!el && el.hasAttribute("data-xray-overlay");
}

function onMouseMove(e: MouseEvent): void {
  const target = e.target as Element | null;
  lastTarget = target;
  if (e.altKey && target && !isOverlay(target)) show(target);
  else hide();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Alt") return;
  if (!ensureAlive()) return;
  if (lastTarget) show(lastTarget);
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key === "Alt") hide();
}

function onClick(e: MouseEvent): void {
  if (!e.altKey) return;
  const target = e.target as Element | null;
  if (!target) return;
  if (!ensureAlive()) return; // old script after a reload: let the page handle the click normally
  e.preventDefault();
  e.stopPropagation();
  const tagged = target.closest<HTMLElement>("[data-source]");
  const message: SelectMessage = {
    type: SELECT_MESSAGE,
    source: tagged?.dataset.source ?? null,
    component: tagged?.dataset.component ?? null,
    url: location.href,
  };
  try {
    chrome.runtime.sendMessage(message).catch((error: unknown) => {
      // No listener means the side panel is not open, which is fine. A dead context means retire.
      if (isContextInvalidated(error) || !contextAlive()) retire();
    });
  } catch (error) {
    // sendMessage can throw synchronously once the context is gone.
    if (isContextInvalidated(error) || !contextAlive()) retire();
  }
}

document.addEventListener("mousemove", onMouseMove, true);
document.addEventListener("keydown", onKeyDown, true);
document.addEventListener("keyup", onKeyUp, true);
document.addEventListener("click", onClick, true);
window.addEventListener("blur", hide);
