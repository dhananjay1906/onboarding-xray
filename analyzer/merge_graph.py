#!/usr/bin/env python3
"""Merge frontend.json and backend.json into graph.json.

Frontend calls are matched to backend routes by HTTP method + normalised path
(`{id}` and `{product_id}` both become `{param}`). Each match becomes a chain:

  component -> api_function -> endpoint -> handler -> functions -> tables

Every node carries file, line range and the code snippet text. The result is
written to --out and copied to --copy-to (the extension bundles it).

Usage:
  python analyzer/merge_graph.py
  python analyzer/merge_graph.py --backend B.json --frontend F.json -o OUT.json --copy-to extension/public/graph.json
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

LAYERS = ["component", "api_function", "endpoint", "handler", "function", "table"]
HERE = Path(__file__).resolve().parent


def normalize_path(path: str) -> str:
    path = re.sub(r"\{[^}]*\}", "{param}", path.split("?")[0])
    return "/" + path.strip("/") if path.strip("/") else "/"


def build_graph(backend: dict, frontend: dict) -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    edge_keys: set[tuple] = set()

    def add_node(node_id: str, node_type: str, **fields) -> str:
        nodes.setdefault(node_id, {"id": node_id, "type": node_type, **fields})
        return node_id

    def add_edge(src: str, dst: str, kind: str, **extra) -> None:
        key = (src, dst, kind)
        if key not in edge_keys:
            edge_keys.add(key)
            edges.append({"from": src, "to": dst, "kind": kind, **extra})

    def loc(d: dict) -> dict:
        return {k: d[k] for k in ("file", "line", "end_line", "snippet")}

    # --- backend nodes (shared by every chain that reaches them)
    routes_by_key: dict[tuple, list[dict]] = {}
    for route in backend["routes"]:
        routes_by_key.setdefault((route["method"], normalize_path(route["path"])), []).append(route)

    def add_table(name: str) -> str:
        table = backend["tables"][name]
        return add_node(f"table:{name}", "table", name=name, table_name=table["table_name"], **loc(table))

    def add_function(fid: str, depth: int, is_handler: bool) -> str:
        fn = backend["functions"][fid]
        node_id = f"{'handler' if is_handler else 'fn'}:{fid}"
        return add_node(node_id, "handler" if is_handler else "function", name=fn["name"], depth=depth, **loc(fn))

    def add_route(route: dict) -> dict:
        """Add endpoint, handler, followed functions and tables; return the chain's backend half."""
        endpoint_id = add_node(
            f"endpoint:{route['id']}", "endpoint", name=route["id"],
            method=route["method"], path=route["path"], **loc(route["decorator"]),
        )
        handler_id = add_function(route["handler"], 0, True)
        add_edge(endpoint_id, handler_id, "routes_to")

        def node_for(fid: str) -> str:
            return handler_id if fid == route["handler"] else f"fn:{fid}"

        fn_nodes = []
        for entry in route["functions"]:
            fn_nodes.append({"id": add_function(entry["id"], entry["depth"], False), "depth": entry["depth"], "parent": node_for(entry["parent"])})
        for call in route["calls"]:
            add_edge(node_for(call["from"]), node_for(call["to"]), "calls", line=call["line"])

        tables: dict[str, dict] = {}
        for t in route["tables"]:
            table_id = add_table(t["table"])
            add_edge(node_for(t["via"]), table_id, "touches", op=t["op"], line=t["line"])
            entry = tables.setdefault(table_id, {"id": table_id, "ops": [], "via": []})
            if t["op"] not in entry["ops"]:
                entry["ops"].append(t["op"])
            if node_for(t["via"]) not in entry["via"]:
                entry["via"].append(node_for(t["via"]))
        return {
            "endpoint": endpoint_id,
            "handler": handler_id,
            "functions": fn_nodes,
            "tables": list(tables.values()),
            "untraced": route["untraced"],
        }

    # --- frontend nodes
    api_nodes: dict[str, str] = {}
    for api in frontend["api_functions"]:
        api_nodes[api["key"]] = add_node(
            f"api:{api['key']}", "api_function", name=api["name"], source_file=api["source_file"],
            endpoints=api["endpoints"], **loc(api),
        )
    components: dict[str, dict] = {}
    for comp in frontend["components"]:
        node_id = add_node(
            f"component:{comp['key']}", "component", name=comp["name"],
            source_file=comp["source_file"], **loc(comp),
        )
        components[node_id] = {
            "id": node_id, "name": comp["name"], "file": comp["file"],
            "source_file": comp["source_file"], "line": comp["line"], "end_line": comp["end_line"],
            "chains": [],
        }

    chains: list[dict] = []
    unmatched: list[dict] = []
    used_routes: set[str] = set()
    used_api: set[str] = set()

    def make_chain(comp_node: str, api_key, endpoint: dict, call_line) -> None:
        matches = routes_by_key.get((endpoint["method"].upper(), normalize_path(endpoint["url"])))
        api_id = api_nodes.get(api_key) if api_key else None
        if not matches:
            unmatched.append({
                "component": comp_node, "api_function": api_id,
                "method": endpoint["method"], "url": endpoint["url"], "reason": "no backend route matches",
            })
            return
        for route in matches:
            back = add_route(route)
            used_routes.add(route["id"])
            if api_id:
                used_api.add(api_id)
                add_edge(comp_node, api_id, "calls_api", line=call_line)
                add_edge(api_id, back["endpoint"], "requests", line=endpoint["line"])
            else:
                add_edge(comp_node, back["endpoint"], "requests", line=endpoint["line"])
            path = [comp_node] + ([api_id] if api_id else []) + [back["endpoint"], back["handler"]]
            path += [f["id"] for f in sorted(back["functions"], key=lambda f: f["depth"])]
            path += [t["id"] for t in back["tables"]]
            chain_id = f"chain:{comp_node.removeprefix('component:')}>{(api_id or '').removeprefix('api:')}>{route['id']}"
            chains.append({
                "id": chain_id,
                "component": comp_node,
                "api_function": api_id,
                "endpoint": back["endpoint"],
                "handler": back["handler"],
                "functions": back["functions"],
                "tables": back["tables"],
                "untraced": back["untraced"],
                "path": path,
            })
            components[comp_node]["chains"].append(chain_id)

    api_by_key = {a["key"]: a for a in frontend["api_functions"]}
    for comp in frontend["components"]:
        comp_node = f"component:{comp['key']}"
        for call in comp["calls"]:
            for endpoint in api_by_key[call["api_function"]]["endpoints"]:
                make_chain(comp_node, call["api_function"], endpoint, call["line"])
        for endpoint in comp["endpoints"]:  # fetch written directly inside a component
            make_chain(comp_node, None, endpoint, endpoint["line"])

    chains.sort(key=lambda c: c["id"])
    return {
        "schema_version": 1,
        "frontend_root": frontend["root"],
        "backend_root": backend["root"],
        "layers": LAYERS,
        "components": dict(sorted(components.items())),
        "chains": chains,
        "nodes": dict(sorted(nodes.items())),
        "edges": edges,
        "unmatched": {
            "frontend_calls": unmatched,
            "routes_without_frontend": sorted(r["id"] for r in backend["routes"] if r["id"] not in used_routes),
            "api_functions_without_component": sorted(
                n["id"] for n in nodes.values() if n["type"] == "api_function" and n["id"] not in used_api
            ),
        },
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--backend", default=str(HERE / "out" / "backend.json"))
    parser.add_argument("--frontend", default=str(HERE / "out" / "frontend.json"))
    parser.add_argument("-o", "--out", default=str(HERE / "out" / "graph.json"))
    parser.add_argument("--copy-to", default=str(HERE.parent / "extension" / "public" / "graph.json"),
                        help="also copy graph.json here (pass '' to skip)")
    args = parser.parse_args(argv)

    backend = json.loads(Path(args.backend).read_text(encoding="utf-8"))
    frontend = json.loads(Path(args.frontend).read_text(encoding="utf-8"))
    graph = build_graph(backend, frontend)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.copy_to:
        dest = Path(args.copy_to)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out, dest)

    un = graph["unmatched"]
    print(f"graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges, {len(graph['chains'])} chains -> {out}"
          + (f" (copied to {args.copy_to})" if args.copy_to else ""))
    for item in un["frontend_calls"]:
        print(f"warning: unmatched frontend call {item['method']} {item['url']}")
    for rid in un["routes_without_frontend"]:
        print(f"note: route with no frontend caller: {rid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
