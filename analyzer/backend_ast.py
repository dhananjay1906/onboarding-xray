#!/usr/bin/env python3
"""Backend analyzer: FastAPI routes -> Python functions -> SQLModel tables.

Walks every .py file under a backend path with the `ast` module and writes
backend.json:

  routes     one entry per (method, full path), with handler, followed calls,
             untraced calls and touched tables
  functions  every function reached from a route, with file, line range, snippet
  tables     every SQLModel `table=True` class

Usage:
  python analyzer/backend_ast.py demo-app/backend -o analyzer/out/backend.json
"""
from __future__ import annotations

import argparse
import ast
import builtins
import json
import sys
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
SKIP_DIRS = {
    "__pycache__", ".venv", "venv", "env", ".git", "node_modules",
    "site-packages", "build", "dist", "tests", "test",
}
MAX_DEPTH = 2  # handler is depth 0; follow direct calls two levels down
BUILTINS = set(dir(builtins))
FuncNode = (ast.FunctionDef, ast.AsyncFunctionDef)


@dataclass
class Module:
    name: str  # dotted module name relative to the scan root
    path: Path
    rel: str  # repo-relative posix path
    tree: ast.Module
    lines: list[str]
    is_package: bool
    functions: dict = field(default_factory=dict)
    classes: dict = field(default_factory=dict)
    imports: dict = field(default_factory=dict)  # local name -> (module, attr | None)
    routers: dict = field(default_factory=dict)  # var -> prefix (APIRouter / FastAPI vars)


def _const_str(node) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _kwarg(call: ast.Call, name: str):
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    return None


def join_path(*parts: str) -> str:
    cleaned = [p.strip("/") for p in parts if p and p.strip("/")]
    return "/" + "/".join(cleaned)


class Analyzer:
    def __init__(self, root: Path, repo_root: Path):
        self.root = root.resolve()
        self.repo_root = repo_root.resolve()
        self.modules: dict[str, Module] = {}
        self.warnings: list[str] = []
        self.includes: dict[tuple, list] = {}  # (module, var) -> [(parent key, prefix)]
        self._fn_cache: dict[str, dict] = {}
        self._tables: dict[str, dict] = {}

    # ---------------------------------------------------------------- loading
    def rel(self, path: Path) -> str:
        path = path.resolve()
        for base in (self.repo_root, self.root.parent):
            try:
                return path.relative_to(base).as_posix()
            except ValueError:
                continue
        return path.as_posix()

    def load(self) -> None:
        for path in sorted(self.root.rglob("*.py")):
            parts = path.relative_to(self.root).parts
            if any(p in SKIP_DIRS for p in parts[:-1]):
                continue
            if path.name.startswith("test_") or path.name == "conftest.py":
                continue
            text = path.read_text(encoding="utf-8")
            try:
                tree = ast.parse(text, filename=str(path))
            except SyntaxError as exc:
                self.warnings.append(f"{self.rel(path)}: syntax error, skipped ({exc.msg} at line {exc.lineno})")
                continue
            mod_parts = list(path.relative_to(self.root).with_suffix("").parts)
            is_package = mod_parts[-1] == "__init__"
            if is_package:
                mod_parts = mod_parts[:-1]
            name = ".".join(mod_parts)
            if not name:
                continue
            self.modules[name] = Module(
                name=name, path=path, rel=self.rel(path), tree=tree,
                lines=text.splitlines(), is_package=is_package,
            )
        for mod in self.modules.values():
            self._index_module(mod)
        for mod in self.modules.values():
            self._find_includes(mod)

    def _index_module(self, mod: Module) -> None:
        for node in mod.tree.body:
            if isinstance(node, FuncNode):
                mod.functions[node.name] = node
            elif isinstance(node, ast.ClassDef):
                mod.classes[node.name] = node
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.asname:
                        mod.imports[alias.asname] = (alias.name, None)
                    else:
                        root_name = alias.name.split(".")[0]
                        mod.imports[root_name] = (root_name, None)
            elif isinstance(node, ast.ImportFrom):
                base = self._from_base(mod, node.level, node.module)
                for alias in node.names:
                    if alias.name != "*":
                        mod.imports[alias.asname or alias.name] = (base, alias.name)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                target = node.targets[0] if isinstance(node, ast.Assign) else node.target
                value = node.value
                if isinstance(target, ast.Name) and isinstance(value, ast.Call):
                    ctor = value.func.id if isinstance(value.func, ast.Name) else getattr(value.func, "attr", None)
                    if ctor == "APIRouter":
                        mod.routers[target.id] = _const_str(_kwarg(value, "prefix")) or ""
                    elif ctor == "FastAPI":
                        mod.routers[target.id] = ""

    @staticmethod
    def _from_base(mod: Module, level: int, module: Optional[str]) -> str:
        if level == 0:
            return module or ""
        pkg = mod.name if mod.is_package else mod.name.rpartition(".")[0]
        for _ in range(level - 1):
            pkg = pkg.rpartition(".")[0]
        if module:
            return f"{pkg}.{module}" if pkg else module
        return pkg

    # ------------------------------------------------------------- resolution
    def resolve_symbol(self, mod_name: str, name: str, depth: int = 0):
        """Find `name` in a project module, following re-exports. Returns (kind, module, node)."""
        mod = self.modules.get(mod_name)
        if mod is None or depth > 5:
            return None
        if name in mod.functions:
            return ("function", mod, mod.functions[name])
        if name in mod.classes:
            return ("class", mod, mod.classes[name])
        if f"{mod_name}.{name}" in self.modules:
            return ("module", self.modules[f"{mod_name}.{name}"], None)
        if name in mod.imports:
            m2, n2 = mod.imports[name]
            if n2 is None:
                return ("module", self.modules[m2], None) if m2 in self.modules else None
            return self.resolve_symbol(m2, n2, depth + 1)
        return None

    def resolve_local(self, mod: Module, name: str):
        """Resolve a bare name used inside `mod`.

        Returns None (not defined/imported: local variable or builtin), or
        (kind, module, node) with kind in function|class|module|external|unresolved.
        """
        if name in mod.functions:
            return ("function", mod, mod.functions[name])
        if name in mod.classes:
            return ("class", mod, mod.classes[name])
        imp = mod.imports.get(name)
        if imp is None:
            return None
        m2, n2 = imp
        if n2 is None:
            return ("module", self.modules[m2], None) if m2 in self.modules else ("external", None, None)
        if f"{m2}.{n2}" in self.modules:
            return ("module", self.modules[f"{m2}.{n2}"], None)
        if m2 not in self.modules:
            return ("external", None, None)
        return self.resolve_symbol(m2, n2) or ("unresolved", None, None)

    # ----------------------------------------------------------------- routers
    def _router_key(self, mod: Module, node) -> Optional[tuple]:
        """Resolve an expression naming a router/app to (module name, var)."""
        if isinstance(node, ast.Name):
            if node.id in mod.routers:
                return (mod.name, node.id)
            imp = mod.imports.get(node.id)
            if imp and imp[1]:
                return self._router_key_in(imp[0], imp[1], 0)
        elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            res = self.resolve_local(mod, node.value.id)
            if res and res[0] == "module" and node.attr in res[1].routers:
                return (res[1].name, node.attr)
        return None

    def _router_key_in(self, mod_name: str, var: str, depth: int) -> Optional[tuple]:
        mod = self.modules.get(mod_name)
        if mod is None or depth > 5:
            return None
        if var in mod.routers:
            return (mod_name, var)
        imp = mod.imports.get(var)
        if imp and imp[1]:
            return self._router_key_in(imp[0], imp[1], depth + 1)
        return None

    def _find_includes(self, mod: Module) -> None:
        for node in ast.walk(mod.tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "include_router" and node.args):
                continue
            parent = self._router_key(mod, node.func.value)
            child = self._router_key(mod, node.args[0])
            if parent is None or child is None:
                self.warnings.append(
                    f"{mod.rel}:{node.lineno}: include_router target could not be resolved"
                )
                continue
            prefix = _const_str(_kwarg(node, "prefix")) or ""
            self.includes.setdefault(child, []).append((parent, prefix))

    def router_prefixes(self, key: tuple, seen: tuple = ()) -> list[str]:
        own = self.modules[key[0]].routers[key[1]]
        parents = self.includes.get(key)
        if not parents or key in seen:
            return [own]
        out = []
        for parent, include_prefix in parents:
            for parent_prefix in self.router_prefixes(parent, seen + (key,)):
                out.append(join_path(parent_prefix, include_prefix, own) if (parent_prefix or include_prefix or own) else "")
        return out

    # ---------------------------------------------------------------- tables
    def _is_table(self, cls: ast.ClassDef) -> bool:
        has_base = any(
            (isinstance(b, ast.Name) and b.id == "SQLModel")
            or (isinstance(b, ast.Attribute) and b.attr == "SQLModel")
            for b in cls.bases
        )
        flag = any(
            kw.arg == "table" and isinstance(kw.value, ast.Constant) and kw.value.value is True
            for kw in cls.keywords
        )
        return has_base and flag

    def collect_tables(self) -> None:
        for mod in self.modules.values():
            for name, cls in mod.classes.items():
                if not self._is_table(cls):
                    continue
                table_name = name.lower()
                for stmt in cls.body:
                    if (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1
                            and isinstance(stmt.targets[0], ast.Name)
                            and stmt.targets[0].id == "__tablename__"
                            and _const_str(stmt.value)):
                        table_name = _const_str(stmt.value)
                if name in self._tables:
                    self.warnings.append(f"duplicate table class name {name} ({mod.rel})")
                    continue
                self._tables[name] = {
                    "name": name,
                    "table_name": table_name,
                    **self._location(mod, cls),
                }

    def _table_class(self, mod: Module, name: str) -> Optional[str]:
        res = self.resolve_local(mod, name)
        if res and res[0] == "class" and self._is_table(res[2]):
            return res[2].name
        return None

    # ------------------------------------------------------------- functions
    def _location(self, mod: Module, node) -> dict:
        start, end = node.lineno, node.end_lineno
        return {
            "file": mod.rel,
            "line": start,
            "end_line": end,
            "snippet": "\n".join(mod.lines[start - 1:end]),
        }

    @staticmethod
    def fn_id(mod: Module, name: str) -> str:
        return f"{mod.rel}::{name}"

    def function_info(self, mod: Module, node) -> dict:
        fid = self.fn_id(mod, node.name)
        if fid in self._fn_cache:
            return self._fn_cache[fid]
        nested = {n.name for n in ast.walk(node) if isinstance(n, FuncNode) and n is not node}
        calls, untraced, tables = [], [], []
        has_add = any(
            isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr == "add"
            for c in ast.walk(node)
        )

        def untrace(call: ast.Call, expr: str) -> None:
            untraced.append({"expr": expr, "file": mod.rel, "line": call.lineno, "traced": False})

        for call in (n for n in ast.walk(node) if isinstance(n, ast.Call)):
            func = call.func
            if isinstance(func, ast.Name):
                self._call_name(mod, call, func.id, nested, calls, tables, has_add, untrace)
            elif isinstance(func, ast.Attribute):
                self._call_attr(mod, call, func, calls, tables, untrace)
            else:
                untrace(call, ast.unparse(func))

        info = {
            "id": fid,
            "name": node.name,
            **self._location(mod, node),
            "calls": _dedupe(calls, ("to",)),
            "untraced": untraced,
            "tables": _dedupe(tables, ("table", "op")),
        }
        self._fn_cache[fid] = info
        return info

    def _call_name(self, mod, call, name, nested, calls, tables, has_add, untrace) -> None:
        if name == "select" or name in ("delete", "update"):
            res = self.resolve_local(mod, name)
            if res and res[0] == "external":
                for arg in call.args:
                    for sub in ast.walk(arg):
                        if isinstance(sub, ast.Name):
                            table = self._table_class(mod, sub.id)
                            if table:
                                tables.append({"table": table, "op": name, "line": call.lineno})
                return
        res = self.resolve_local(mod, name)
        if res is None:
            if name in BUILTINS or name in nested:
                return
            untrace(call, name)  # callable held in a variable or parameter
        elif res[0] == "function":
            calls.append({"to": self.fn_id(res[1], res[2].name), "line": call.lineno})
        elif res[0] == "class":
            table = self._table_class(mod, name)
            if table:
                tables.append({"table": table, "op": "create" if has_add else "construct", "line": call.lineno})
        elif res[0] == "unresolved":
            untrace(call, name)

    def _call_attr(self, mod, call, func, calls, tables, untrace) -> None:
        if func.attr == "get" and call.args and isinstance(call.args[0], ast.Name):
            table = self._table_class(mod, call.args[0].id)
            if table:
                tables.append({"table": table, "op": "get", "line": call.lineno})
                return
        if func.attr == "select":
            return
        root = func.value
        if not isinstance(root, ast.Name):
            return  # method chain on a call result or deeper attribute: not a module call
        res = self.resolve_local(mod, root.id)
        if res is None or res[0] != "module":
            return  # method on a local variable, class or external library
        target = self.resolve_symbol(res[1].name, func.attr)
        if target is None:
            untrace(call, ast.unparse(func))
        elif target[0] == "function":
            calls.append({"to": self.fn_id(target[1], target[2].name), "line": call.lineno})

    # ---------------------------------------------------------------- routes
    def trace(self, mod: Module, node) -> dict:
        handler = self.function_info(mod, node)
        seen = {handler["id"]: (0, None)}
        queue = deque([handler["id"]])
        edges, untraced = [], []
        infos = {handler["id"]: handler}
        by_id = {self.fn_id(m, n.name): (m, n) for m in self.modules.values() for n in m.functions.values()}
        while queue:
            fid = queue.popleft()
            depth = seen[fid][0]
            m, n = by_id[fid]
            info = self.function_info(m, n)
            infos[fid] = info
            untraced.extend(info["untraced"])
            if depth >= MAX_DEPTH:
                continue
            for call in info["calls"]:
                edges.append({"from": fid, "to": call["to"], "line": call["line"]})
                if call["to"] not in seen:
                    seen[call["to"]] = (depth + 1, fid)
                    queue.append(call["to"])
        tables = []
        for fid, info in infos.items():
            for t in info["tables"]:
                tables.append({**t, "via": fid})
        return {
            "functions": [
                {"id": fid, "depth": d, "parent": p}
                for fid, (d, p) in seen.items() if fid != handler["id"]
            ],
            "calls": _dedupe(edges, ("from", "to")),
            "untraced": untraced,
            "tables": tables,
            "infos": infos,
        }

    def analyze(self) -> dict:
        self.load()
        self.collect_tables()
        routes, functions = [], {}
        for mod in self.modules.values():
            for fn in mod.functions.values():
                for dec in fn.decorator_list:
                    if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)
                            and isinstance(dec.func.value, ast.Name)
                            and dec.func.value.id in mod.routers):
                        continue
                    attr = dec.func.attr
                    if attr in HTTP_METHODS:
                        methods = [attr.upper()]
                    elif attr == "api_route":
                        listed = _kwarg(dec, "methods")
                        methods = [_const_str(e).upper() for e in getattr(listed, "elts", []) if _const_str(e)]
                    else:
                        continue
                    path_node = dec.args[0] if dec.args else _kwarg(dec, "path")
                    route_path = _const_str(path_node) if path_node is not None else ""
                    if route_path is None:
                        self.warnings.append(f"{mod.rel}:{dec.lineno}: non-literal route path, skipped")
                        continue
                    traced = self.trace(mod, fn)
                    functions.update(traced.pop("infos"))
                    key = (mod.name, dec.func.value.id)
                    for prefix in self.router_prefixes(key):
                        full = join_path(prefix, route_path)
                        for method in methods:
                            routes.append({
                                "id": f"{method} {full}",
                                "method": method,
                                "path": full,
                                "router": f"{mod.rel}:{key[1]}",
                                "handler": self.fn_id(mod, fn.name),
                                "decorator": {
                                    "file": mod.rel,
                                    "line": dec.lineno,
                                    "end_line": dec.end_lineno,
                                    "snippet": "\n".join(mod.lines[dec.lineno - 1:dec.end_lineno]),
                                },
                                **traced,
                            })
        routes.sort(key=lambda r: (r["path"], r["method"]))
        return {
            "root": self.rel(self.root),
            "routes": routes,
            "functions": dict(sorted(functions.items())),
            "tables": dict(sorted(self._tables.items())),
            "warnings": self.warnings,
        }


def _dedupe(items: list[dict], keys: tuple) -> list[dict]:
    seen, out = set(), []
    for item in items:
        k = tuple(item[key] for key in keys)
        if k not in seen:
            seen.add(k)
            out.append(item)
    return out


def analyze(path, repo_root=None) -> dict:
    path = Path(path)
    return Analyzer(path, Path(repo_root) if repo_root else Path.cwd()).analyze()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("backend_path", help="folder containing the FastAPI app")
    parser.add_argument("--repo-root", default=".", help="paths in the output are relative to this (default: cwd)")
    parser.add_argument("-o", "--out", default="analyzer/out/backend.json")
    args = parser.parse_args(argv)

    result = analyze(args.backend_path, args.repo_root)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    untraced = sum(len(r["untraced"]) for r in result["routes"])
    print(f"backend: {len(result['routes'])} routes, {len(result['functions'])} functions, "
          f"{len(result['tables'])} tables, {untraced} untraced calls -> {out}")
    for w in result["warnings"]:
        print(f"warning: {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
