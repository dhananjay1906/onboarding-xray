/**
 * Frontend analyzer: React components -> api.ts functions -> HTTP endpoints.
 *
 * Parses every .ts/.tsx file under <frontend>/src with @babel/parser and writes frontend.json:
 *   api_functions  functions that make HTTP calls, with the (method, url) pairs they hit
 *   components     PascalCase functions in .tsx files, with the api functions they call
 *   wrappers       helper functions around fetch/axios (the URL is a parameter), detected
 *                  automatically so `request("/api/x")` call sites count as endpoint calls
 *   unresolved     HTTP calls whose URL could not be determined statically
 *
 * Usage:
 *   tsx analyzer/frontend_calls.ts demo-app/frontend -o analyzer/out/frontend.json
 */
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// CJS/ESM interop: the default export may be wrapped in { default }.
const traverse: (ast: t.Node, visitors: Record<string, (p: any) => void>) => void =
  (_traverse as any).default ?? _traverse;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
const BASE_LIKE = /(base|origin|host|api_?url|server)/i;
const marker = (i: number) => `\u0000P${i}\u0000`;

interface FileInfo {
  abs: string;
  rel: string; // repo-relative, posix
  srcRel: string; // relative to the frontend root: what data-source attributes use
  lines: string[];
  isTsx: boolean;
  imports: Map<string, { source: string; imported: string }>;
  topFns: Map<string, TopFn>;
}

interface Endpoint {
  method: string;
  url: string;
  line: number;
}

interface TopFn {
  name: string;
  file: FileInfo;
  stmt: t.Statement;
  fn: t.Function;
  params: string[];
  isDefault: boolean;
  line: number;
  endLine: number;
  calls: t.CallExpression[];
  wrapper?: { template: string; method: { static?: string; paramIndex?: number } };
  endpoints: Endpoint[];
}

interface Unresolved {
  file: string;
  line: number;
  code: string;
  reason: string;
}

// ---------------------------------------------------------------- file loading
function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
}

const posix = (p: string) => p.split(path.sep).join("/");

function paramNames(fn: t.Function): string[] {
  return fn.params.map((p) => {
    if (t.isIdentifier(p)) return p.name;
    if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) return p.left.name;
    return "";
  });
}

function loadFile(abs: string, frontendRoot: string, repoRoot: string): { info: FileInfo; ast: t.File } {
  const code = fs.readFileSync(abs, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const info: FileInfo = {
    abs,
    rel: posix(path.relative(repoRoot, abs)),
    srcRel: posix(path.relative(frontendRoot, abs)),
    lines: code.split(/\r?\n/),
    isTsx: abs.endsWith(".tsx"),
    imports: new Map(),
    topFns: new Map(),
  };

  const addFn = (name: string, fn: t.Function, stmt: t.Statement, isDefault: boolean) => {
    info.topFns.set(name, {
      name, file: info, stmt, fn, params: paramNames(fn), isDefault,
      line: stmt.loc!.start.line, endLine: stmt.loc!.end.line, calls: [], endpoints: [],
    });
  };
  const fromVarDecl = (decl: t.VariableDeclaration, stmt: t.Statement) => {
    for (const d of decl.declarations) {
      if (t.isIdentifier(d.id) && (t.isArrowFunctionExpression(d.init) || t.isFunctionExpression(d.init))) {
        addFn(d.id.name, d.init, stmt, false);
      }
    }
  };

  for (const stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt)) {
      for (const s of stmt.specifiers) {
        const imported = t.isImportSpecifier(s)
          ? (t.isIdentifier(s.imported) ? s.imported.name : s.imported.value)
          : t.isImportDefaultSpecifier(s) ? "default" : "*";
        info.imports.set(s.local.name, { source: stmt.source.value, imported });
      }
    } else if (t.isFunctionDeclaration(stmt) && stmt.id) {
      addFn(stmt.id.name, stmt, stmt, false);
    } else if (t.isVariableDeclaration(stmt)) {
      fromVarDecl(stmt, stmt);
    } else if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
      if (t.isFunctionDeclaration(stmt.declaration) && stmt.declaration.id) {
        addFn(stmt.declaration.id.name, stmt.declaration, stmt, false);
      } else if (t.isVariableDeclaration(stmt.declaration)) {
        fromVarDecl(stmt.declaration, stmt);
      }
    } else if (t.isExportDefaultDeclaration(stmt) && t.isFunctionDeclaration(stmt.declaration) && stmt.declaration.id) {
      addFn(stmt.declaration.id.name, stmt.declaration, stmt, true);
    }
  }
  return { info, ast };
}

// ------------------------------------------------------------- URL extraction
function unwrap(e: t.Node): t.Node {
  while (t.isTSAsExpression(e) || t.isTSNonNullExpression(e) || t.isParenthesizedExpression(e) || t.isTSSatisfiesExpression(e)) {
    e = e.expression;
  }
  return e;
}

function exprName(e: t.Node): string {
  e = unwrap(e);
  if (t.isIdentifier(e)) return e.name;
  if (t.isMemberExpression(e)) {
    const prop = t.isIdentifier(e.property) ? e.property.name : "";
    return `${exprName(e.object)}.${prop}`;
  }
  if (t.isMetaProperty(e)) return `${e.meta.name}.${e.property.name}`;
  return "";
}

/** Normalised URL text for an expression; null when it cannot be understood. */
function urlText(e: t.Node, params: string[]): string | null {
  e = unwrap(e);
  if (t.isStringLiteral(e)) return e.value;
  if (t.isTemplateLiteral(e)) {
    let out = "";
    e.quasis.forEach((q, i) => {
      out += q.value.cooked ?? q.value.raw;
      const ex = e.expressions[i];
      if (ex) out += partText(ex as t.Node, params);
    });
    return out;
  }
  if (t.isBinaryExpression(e) && e.operator === "+") {
    return partText(e.left, params) + partText(e.right, params);
  }
  if (t.isIdentifier(e) && params.includes(e.name)) return marker(params.indexOf(e.name));
  return null;
}

/** A piece inside a template or concatenation: `${id}` becomes {param}. */
function partText(e: t.Node, params: string[]): string {
  e = unwrap(e);
  if (t.isIdentifier(e) && params.includes(e.name)) return marker(params.indexOf(e.name));
  if (BASE_LIKE.test(exprName(e))) return "";
  const text = urlText(e, params);
  return text ?? "{param}";
}

function cleanUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
}

function objectProp(obj: t.ObjectExpression, key: string): t.Node | undefined {
  for (const p of obj.properties) {
    if (t.isObjectProperty(p) && !p.computed) {
      const name = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : "";
      if (name === key) return p.value;
    }
  }
  return undefined;
}

// ----------------------------------------------------------------------- main
export function analyze(frontendRoot: string, repoRoot: string) {
  frontendRoot = path.resolve(frontendRoot);
  repoRoot = path.resolve(repoRoot);
  const srcDir = fs.existsSync(path.join(frontendRoot, "src")) ? path.join(frontendRoot, "src") : frontendRoot;
  const absFiles: string[] = [];
  walk(srcDir, absFiles);
  absFiles.sort();

  const files = new Map<string, FileInfo>();
  const asts = new Map<string, t.File>();
  const unresolved: Unresolved[] = [];
  for (const abs of absFiles) {
    const { info, ast } = loadFile(abs, frontendRoot, repoRoot);
    files.set(abs, info);
    asts.set(abs, ast);
  }

  // Attach every call expression to its top-level function.
  for (const [abs, ast] of asts) {
    const info = files.get(abs)!;
    const byStmt = new Map<t.Node, TopFn>();
    for (const fn of info.topFns.values()) byStmt.set(fn.stmt, fn);
    traverse(ast, {
      CallExpression(p) {
        const stmt = p.find((x: any) => x.parentPath?.isProgram() ?? false);
        const top = stmt ? byStmt.get(stmt.node) : undefined;
        if (top) top.calls.push(p.node);
      },
    });
  }

  const resolveModule = (fromAbs: string, source: string): FileInfo | null => {
    if (!source.startsWith(".")) return null;
    const base = path.resolve(path.dirname(fromAbs), source);
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      const f = files.get(cand);
      if (f) return f;
    }
    return null;
  };

  const resolveCallee = (file: FileInfo, callee: t.Node): TopFn | null => {
    callee = unwrap(callee);
    if (t.isIdentifier(callee)) {
      const local = file.topFns.get(callee.name);
      if (local) return local;
      const imp = file.imports.get(callee.name);
      const target = imp && resolveModule(file.abs, imp.source);
      if (imp && target && imp.imported !== "*") {
        if (imp.imported === "default") return [...target.topFns.values()].find((f) => f.isDefault) ?? null;
        return target.topFns.get(imp.imported) ?? null;
      }
    } else if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
      const imp = file.imports.get(callee.object.name);
      const target = imp && imp.imported === "*" ? resolveModule(file.abs, imp.source) : null;
      return target?.topFns.get(callee.property.name) ?? null;
    }
    return null;
  };

  /** fetch(...) / axios.get(...) / axios({...}) -> pieces, or null when not an HTTP call. */
  const httpCall = (call: t.CallExpression) => {
    const callee = unwrap(call.callee);
    if (t.isIdentifier(callee) && callee.name === "fetch") {
      return { urlArg: call.arguments[0], optsArg: call.arguments[1], method: undefined as string | undefined };
    }
    if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property)) {
      const objName = exprName(callee.object);
      if ((objName === "window" || objName === "globalThis") && callee.property.name === "fetch") {
        return { urlArg: call.arguments[0], optsArg: call.arguments[1], method: undefined };
      }
      if (objName === "axios" && HTTP_METHODS.has(callee.property.name)) {
        return { urlArg: call.arguments[0], optsArg: call.arguments[1], method: callee.property.name.toUpperCase() };
      }
    }
    if (t.isIdentifier(callee) && callee.name === "axios" && t.isObjectExpression(call.arguments[0])) {
      const cfg = call.arguments[0];
      const m = objectProp(cfg, "method");
      return {
        urlArg: objectProp(cfg, "url"), optsArg: undefined,
        method: t.isStringLiteral(m) ? m.value.toUpperCase() : "GET",
      };
    }
    return null;
  };

  const fetchMethod = (opts: t.Node | undefined, params: string[]): { static?: string; paramIndex?: number } => {
    if (!opts) return { static: "GET" };
    opts = unwrap(opts);
    if (t.isIdentifier(opts) && params.includes(opts.name)) return { paramIndex: params.indexOf(opts.name) };
    if (t.isObjectExpression(opts)) {
      const m = objectProp(opts, "method");
      if (t.isStringLiteral(m)) return { static: m.value.toUpperCase() };
      for (const p of opts.properties) {
        if (t.isSpreadElement(p) && t.isIdentifier(p.argument) && params.includes(p.argument.name)) {
          return { paramIndex: params.indexOf(p.argument.name) };
        }
      }
    }
    return { static: "GET" };
  };

  // Pass 1: direct HTTP calls. A URL built from a parameter makes the function a wrapper.
  for (const top of allTopFns(files)) {
    for (const call of top.calls) {
      const http = httpCall(call);
      if (!http) continue;
      const line = call.loc!.start.line;
      const text = http.urlArg ? urlText(http.urlArg as t.Node, top.params) : null;
      if (text === null) {
        unresolved.push({ file: top.file.rel, line, code: src(top.file, call), reason: "URL is not a literal, template or parameter" });
        continue;
      }
      if (/\u0000P\d+\u0000/.test(text)) {
        top.wrapper = {
          template: text,
          method: http.method ? { static: http.method } : fetchMethod(http.optsArg as t.Node | undefined, top.params),
        };
        continue;
      }
      let method = http.method;
      if (!method) {
        const m = fetchMethod(http.optsArg as t.Node | undefined, top.params);
        method = m.static ?? "GET";
      }
      top.endpoints.push({ method, url: cleanUrl(text), line });
    }
  }

  // Pass 2: calls to wrapper functions are endpoint calls too.
  for (const top of allTopFns(files)) {
    for (const call of top.calls) {
      const target = resolveCallee(top.file, call.callee);
      if (!target || !target.wrapper || target === top) continue;
      const line = call.loc!.start.line;
      let url = target.wrapper.template;
      let failed = false;
      url = url.replace(/\u0000P(\d+)\u0000/g, (_, idx) => {
        const arg = call.arguments[Number(idx)];
        // No params here: `${id}` is a plain {param}; passing a bare parameter through is not supported.
        const text = arg ? urlText(arg as t.Node, []) : null;
        if (text === null) failed = true;
        return text ?? "";
      });
      if (failed) {
        unresolved.push({ file: top.file.rel, line, code: src(top.file, call), reason: `argument to ${target.name}() is not a literal or template` });
        continue;
      }
      const wm = target.wrapper.method;
      let method = wm.static;
      if (!method) {
        const optArg = call.arguments[wm.paramIndex ?? -1];
        const m = optArg && t.isObjectExpression(unwrap(optArg)) ? objectProp(unwrap(optArg) as t.ObjectExpression, "method") : undefined;
        method = t.isStringLiteral(m) ? m.value.toUpperCase() : "GET";
      }
      top.endpoints.push({ method, url: cleanUrl(url), line });
    }
  }

  const isComponent = (f: TopFn) => f.file.isTsx && /^[A-Z]/.test(f.name);
  const fnKey = (f: TopFn) => `${f.file.srcRel}#${f.name}`;
  const record = (f: TopFn) => ({
    name: f.name,
    file: f.file.rel,
    source_file: f.file.srcRel,
    line: f.line,
    end_line: f.endLine,
    snippet: f.file.lines.slice(f.line - 1, f.endLine).join("\n"),
  });
  const dedupe = (eps: Endpoint[]) => {
    const seen = new Set<string>();
    return eps.filter((e) => !seen.has(`${e.method} ${e.url}`) && seen.add(`${e.method} ${e.url}`));
  };

  const everything = allTopFns(files);
  const apiFns = everything.filter((f) => f.endpoints.length && !isComponent(f) && !f.wrapper);
  const apiSet = new Set(apiFns);

  const api_functions = apiFns.map((f) => ({ key: fnKey(f), ...record(f), endpoints: dedupe(f.endpoints) }));
  const wrappers = everything.filter((f) => f.wrapper).map((f) => ({ key: fnKey(f), ...record(f) }));
  const components = everything.filter(isComponent).map((f) => {
    const calls: { api_function: string; line: number }[] = [];
    for (const call of f.calls) {
      const target = resolveCallee(f.file, call.callee);
      if (target && apiSet.has(target)) calls.push({ api_function: fnKey(target), line: call.loc!.start.line });
    }
    return { key: fnKey(f), ...record(f), calls, endpoints: dedupe(f.endpoints) };
  });

  return {
    root: posix(path.relative(repoRoot, frontendRoot)),
    api_functions,
    components,
    wrappers,
    unresolved,
  };
}

function allTopFns(files: Map<string, FileInfo>): TopFn[] {
  const out: TopFn[] = [];
  for (const f of files.values()) out.push(...[...f.topFns.values()].sort((a, b) => a.line - b.line));
  return out;
}

function src(file: FileInfo, node: t.Node): string {
  return file.lines.slice(node.loc!.start.line - 1, node.loc!.end.line).join(" ").trim().slice(0, 120);
}

function main(argv: string[]): void {
  const positional: string[] = [];
  let out = "analyzer/out/frontend.json";
  let repoRoot = ".";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-o" || argv[i] === "--out") out = argv[++i];
    else if (argv[i] === "--repo-root") repoRoot = argv[++i];
    else positional.push(argv[i]);
  }
  if (positional.length !== 1) {
    console.error("usage: tsx frontend_calls.ts <frontend-folder> [--repo-root DIR] [-o OUT.json]");
    process.exit(2);
  }
  const result = analyze(positional[0], repoRoot);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  const endpoints = result.api_functions.reduce((n, f) => n + f.endpoints.length, 0);
  console.log(
    `frontend: ${result.components.length} components, ${result.api_functions.length} api functions, ` +
      `${endpoints} endpoints, ${result.unresolved.length} unresolved -> ${out}`,
  );
  for (const u of result.unresolved) console.error(`warning: ${u.file}:${u.line}: ${u.reason}: ${u.code}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
