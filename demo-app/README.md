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

## Deploy (Firebase Hosting + Render free tier)

Config is in the repo: `render.yaml` (backend) and the `hosting` block of `firebase.json` (frontend, site `onboarding-xray`).

**1. Backend on Render** (dashboard, once)

1. Go to https://dashboard.render.com and sign in with GitHub.
2. Click **New +** (top right), then **Blueprint**.
3. Under **Connect a repository**, click **Configure account**, allow Render access to the repo `onboarding-xray` (Only select repositories), and Save.
4. Back on Render, click **Connect** next to `onboarding-xray`.
5. Leave the blueprint name, check that it lists web service `onboarding-xray-api` on the **Free** plan with `ALLOWED_ORIGINS` and `PYTHON_VERSION`, then click **Deploy Blueprint**.
6. Open the service `onboarding-xray-api`, wait until the top shows **Live** (first build takes a few minutes), then copy the URL under the service name, e.g. `https://onboarding-xray-api.onrender.com`.
7. Open `<that URL>/api/products` in a browser: it should show the sample products as JSON.

The free tier sleeps after 15 minutes without traffic, so the first request after a pause takes about a minute. Open the demo store once before a demo to wake it. The SQLite file is wiped on each restart; the app re-seeds the products on startup.

**2. Frontend on Firebase Hosting** (from the repo root, logged in with `firebase login`)

```
cd demo-app/frontend
VITE_API_BASE=https://onboarding-xray-api.onrender.com npm run build   # no trailing slash; tags stay on (VITE_XRAY_TAGS defaults to true)
cd ../..
firebase deploy --only hosting
```

The app is then at https://onboarding-xray.web.app. If your Render URL differs, set it in `VITE_API_BASE` and in the Render `ALLOWED_ORIGINS` only if you changed the Hosting site.

## Privacy

There are no accounts and no email field. The frontend generates an anonymous session id, stores it in `localStorage` and sends it as the `X-Session-Id` header. `GET /api/orders` returns only that session's orders.

## Test

```
cd demo-app/backend
python -m pytest
```

The Vite plugin `plugins/dataSource.ts` adds `data-source="path:line"` and `data-component="Name"` to every DOM element in `src/*.tsx`, in dev and production builds. Set `VITE_XRAY_TAGS=false` to turn it off.
