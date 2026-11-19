import Prism from "prismjs";
// Order matters: each grammar extends the previous one.
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function languageFor(file: string): string {
  if (file.endsWith(".py")) return "python";
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts")) return "typescript";
  if (file.endsWith(".jsx")) return "jsx";
  return "javascript";
}

/** HTML for a highlighted snippet. Prism escapes the source, so the result is safe to inject. */
export function highlightCode(code: string, file: string): string {
  const lang = languageFor(file);
  const grammar = Prism.languages[lang];
  return grammar ? Prism.highlight(code, grammar, lang) : escapeHtml(code);
}
