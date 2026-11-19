// Hold Alt to highlight the element under the cursor; Alt+click sends its source tag to the side panel.
import { SELECT_MESSAGE, type SelectMessage } from "../lib/messages";

let box: HTMLDivElement | null = null;
let lastTarget: Element | null = null;

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

document.addEventListener(
  "mousemove",
  (e) => {
    const target = e.target as Element | null;
    lastTarget = target;
    if (e.altKey && target && !isOverlay(target)) show(target);
    else hide();
  },
  true,
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Alt" && lastTarget) show(lastTarget);
  },
  true,
);
document.addEventListener("keyup", (e) => e.key === "Alt" && hide(), true);
window.addEventListener("blur", hide);

document.addEventListener(
  "click",
  (e) => {
    if (!e.altKey) return;
    const target = e.target as Element | null;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const tagged = target.closest<HTMLElement>("[data-source]");
    const message: SelectMessage = {
      type: SELECT_MESSAGE,
      source: tagged?.dataset.source ?? null,
      component: tagged?.dataset.component ?? null,
      url: location.href,
    };
    chrome.runtime.sendMessage(message).catch(() => {
      // The side panel is not open: nothing is listening, which is fine.
    });
  },
  true,
);
