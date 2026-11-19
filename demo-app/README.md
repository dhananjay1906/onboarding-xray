# Demo store

Small React + FastAPI shop that Onboarding X-Ray inspects.

Chain: Checkout button -> `POST /api/orders` -> `create_order()` -> `order_service.place_order()` -> `Order`, `OrderItem` tables.

## Run (two terminals, from the repo root)

Backend (Python venv active):

```
pip install -r demo-app/backend/requirements.txt
cd demo-app/backend
uvicorn main:app --port 8000
```

The backend creates the tables and seeds sample products on startup if the database is empty, so hosts that wipe SQLite still work. `python seed.py` does the same by hand. If you have a `store.db` from an older version, delete it: the schema changed (no email, `session_id` added) and tables are not migrated.

Frontend:

```
cd demo-app/frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend on port 8000.

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `ALLOWED_ORIGINS` | backend | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins, e.g. your Firebase Hosting URL |
| `VITE_API_BASE` | frontend (build time) | empty | Backend base URL for hosted builds, no trailing slash. Empty uses the Vite dev proxy |
| `VITE_XRAY_TAGS` | frontend (build time) | `true` | Set to `false` to disable `data-source` tagging |

## Privacy

There are no accounts and no email field. The frontend generates an anonymous session id, stores it in `localStorage` and sends it as the `X-Session-Id` header. `GET /api/orders` returns only that session's orders.

## Test

```
cd demo-app/backend
python -m pytest
```

The Vite plugin `plugins/dataSource.ts` adds `data-source="path:line"` and `data-component="Name"` to every DOM element in `src/*.tsx`, in dev and production builds. Set `VITE_XRAY_TAGS=false` to turn it off.
