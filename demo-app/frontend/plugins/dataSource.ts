import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import MagicString from "magic-string";
import path from "node:path";
import type { Plugin } from "vite";

// CJS/ESM interop: @babel/traverse exports { default: fn } under some loaders.
const traverse: typeof _traverse =
  (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse;

/**
 * Adds data-source="relative/path.tsx:line" and data-component="Name" to every
 * lowercase (DOM) JSX element in src/ (dev and build; disable with VITE_XRAY_TAGS=false). The X-Ray extension reads these on Alt+click.
 */
export default function dataSource(): Plugin {
  // Vite ids use forward slashes, even on Windows.
  const root = process.cwd().split(path.sep).join("/");
  return {
    name: "xray-data-source",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!/\.tsx$/.test(file) || file.includes("node_modules")) return null;
      if (!file.startsWith(`${root}/src/`)) return null;

      const rel = file.slice(root.length + 1);
      const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
      const s = new MagicString(code);

      traverse(ast, {
        JSXOpeningElement(p) {
          const name = p.node.name;
          if (name.type !== "JSXIdentifier" || !/^[a-z]/.test(name.name)) return;
          if (p.node.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === "data-source")) return;

          let component = "Anonymous";
          let fn = p.getFunctionParent();
          while (fn) {
            const node = fn.node;
            if ("id" in node && node.id && node.id.type === "Identifier" && /^[A-Z]/.test(node.id.name)) {
              component = node.id.name;
              break;
            }
            const parent = fn.parentPath;
            if (parent?.isVariableDeclarator() && parent.node.id.type === "Identifier" && /^[A-Z]/.test(parent.node.id.name)) {
              component = parent.node.id.name;
              break;
            }
            fn = fn.getFunctionParent();
          }

          const line = p.node.loc?.start.line ?? 0;
          const insertAt = p.node.name.end!;
          s.appendLeft(insertAt, ` data-source="${rel}:${line}" data-component="${component}"`);
        },
      });

      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}
