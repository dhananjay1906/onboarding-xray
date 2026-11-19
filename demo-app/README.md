# Demo store

Small React + FastAPI shop that Onboarding X-Ray inspects.

Chain: Checkout button -> `POST /api/orders` -> `create_order()` -> `order_service.place_order()` -> `Order`, `OrderItem` tables.

## Run (two terminals, from the repo root)

Backend (Python venv active):

```
pip install -r demo-app/backend/requirements.txt
cd demo-app/backend
python seed.py
uvicorn main:app --port 8000
```

Frontend:

```
cd demo-app/frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend on port 8000.

## Test

```
cd demo-app/backend
python -m pytest
```

In dev mode the Vite plugin `plugins/dataSource.ts` adds `data-source="path:line"` and `data-component="Name"` to every DOM element in `src/*.tsx`.
