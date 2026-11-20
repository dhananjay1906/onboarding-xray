# Analyzers

Build-time scripts that turn an app's source into `graph.json`, the chain the X-Ray extension shows:

```
React component -> api.ts function -> FastAPI route -> Python functions -> database table
```

## One command

From the repo root (Python venv created, Node installed):

```
npm run analyze
```

This runs the three steps below and copies the result to `extension/public/graph.json`. It uses `.venv` if present, otherwise `python3`/`python` (or set `PYTHON`), and runs `npm install` in `analyzer/` the first time.

To analyze a different app:

```
npm run analyze -- --backend path/to/backend --frontend path/to/frontend
```

## The steps

| Step | Script | Output |
|---|---|---|
| 1. Backend | `backend_ast.py` | `out/backend.json`: routes, followed calls (2 levels), SQLModel tables |
| 2. Frontend | `frontend_calls.ts` | `out/frontend.json`: components, api functions, HTTP calls |
| 3. Merge | `merge_graph.py` | `out/graph.json`, copied to `extension/public/graph.json` |

Run them by hand:

```
python analyzer/backend_ast.py demo-app/backend -o analyzer/out/backend.json
cd analyzer && npx tsx frontend_calls.ts ../demo-app/frontend --repo-root .. -o out/frontend.json && cd ..
python analyzer/merge_graph.py
```

`analyzer/out/` is git-ignored. `extension/public/graph.json` is committed, so rerun `npm run analyze` and commit it after changing the demo app.

## Notes

- The demo frontend's `data-source` tags (`path:line`) match the `source_file` and line ranges of components in `graph.json`.
- Calls the backend analyzer cannot follow (callables in variables, `getattr`, unknown project functions) are listed per chain under `untraced` with `"traced": false`.
- The frontend analyzer detects helpers that wrap `fetch`/`axios` (URL passed as a parameter), so `request("/api/orders", { method: "POST" })` counts as `POST /api/orders`.

## Tests

```
python -m pytest analyzer/tests
```

## Analyzing your own project

```
npm run analyze -- --backend path/to/backend --frontend path/to/frontend --no-copy
```

`--no-copy` writes only `analyzer/out/graph.json` and does not overwrite the extension's bundled `extension/public/graph.json`. Load the file from the extension's welcome page (step 3). Without `--no-copy` the graph is also copied into `extension/public/graph.json`, which is what the demo build bundles.
