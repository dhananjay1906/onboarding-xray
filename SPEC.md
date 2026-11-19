# Onboarding X-Ray — Project Spec

## What we are building
Onboarding X-Ray helps a developer understand an unfamiliar web app. You Alt+click any element in a running app, and a side panel shows the full chain of code behind it:

React component → API call → FastAPI route → Python functions → database table

The panel also gives a plain-English, step-by-step explanation written by an LLM from the real code snippets.

Built for the "Build Your First AI App 2026" hackathon (Devpost, category: AI Productivity Tools).

## Parts
1. **Demo store app**: a small React + FastAPI shop that X-Ray inspects.
2. **Analyzers**: scan the demo app's backend and frontend code once and produce `graph.json`.
3. **Click overlay**: a script inside the demo app that captures Alt+click and reports the clicked component's source location.
4. **X-Ray API**: FastAPI service that serves the graph, resolves a click to a chain, and calls the LLM.
5. **X-Ray UI**: React panel showing the flow diagram, code snippets and AI explanation.

## Tech stack (all free; no paid services)
| Area | Tool |
|---|---|
| Demo backend | Python 3.11+, FastAPI, SQLModel, SQLite |
| Demo frontend | React, TypeScript, Vite |
| Source tagging | Custom Vite/Babel plugin adding `data-source="path:line"` to JSX elements |
| Backend analyzer | Python `ast` module |
| Frontend analyzer | Node + `@babel/parser` + `@babel/traverse` |
| X-Ray API | FastAPI |
| LLM | Gemini API free tier via `google-genai` Python SDK; Groq free tier as fallback |
| X-Ray UI | React, TypeScript, Vite, Tailwind CSS, React Flow (`@xyflow/react`), Shiki or Prism |
| Overlay | Vanilla TypeScript, `postMessage` |
| Hosting | Vercel (frontends), Render or Hugging Face Spaces Docker (backends) |

## Repo structure
```
onboarding-xray/
├── demo-app/
│   ├── backend/          # FastAPI: routers/, services/, models/, seed.py
│   └── frontend/         # React + Vite + data-source plugin + overlay import
├── xray/
│   ├── analyzer/
│   │   ├── backend_ast.py
│   │   ├── frontend_calls.ts
│   │   └── merge_graph.py
│   ├── api/              # FastAPI: /graph, /trace, /explain
│   ├── overlay/          # click overlay script
│   └── ui/               # React panel
├── docs/                 # architecture diagram, screenshots
├── .env.example          # GEMINI_API_KEY=
├── .gitignore            # includes .env
└── README.md
```

## Component requirements

### 1. Demo store app
- Screens: product list, product detail, cart, checkout, order history.
- Backend layered on purpose so traces cross layers: `routers/` → `services/` → `models/` (SQLModel `table=True`).
- Example chain that must work: Checkout button → `POST /api/orders` → `create_order()` → `order_service.place_order()` → `Order`, `OrderItem` tables.
- All frontend API calls live in `src/api.ts` (one function per endpoint) and are called from components.
- Seed script with sample products.

### 2. Backend analyzer (`backend_ast.py`)
- Walk all `.py` files under a given backend path.
- Detect FastAPI routes from decorators (`@app.get/post/put/delete`, `@router.*`), including `APIRouter(prefix=...)` and `include_router(prefix=...)`. Record method, full path, handler name, file, line.
- Build a call graph from each handler, following direct calls up to 2 levels deep, resolving imports within the project. Unresolved or dynamic calls are kept and marked `"traced": false`.
- Detect SQLModel tables (`class X(SQLModel, table=True)`) and which functions touch them (`select(X)`, `X(...)` followed by `session.add`, `session.get(X, ...)`).
- Output `backend.json`: `routes[]`, `functions[]` (name, file, line, end_line, calls[], tables[]), `tables[]`.

### 3. Frontend analyzer (`frontend_calls.ts`)
- Parse all `.ts`/`.tsx` files under a given frontend path.
- Find `fetch(...)` and `axios.<method>(...)` calls; extract method and URL (handle template literals → normalize `${id}` to `{param}`).
- Map functions in `api.ts` to endpoints, then map components to the `api.ts` functions they call.
- Output `frontend.json`: `components[]` (name, file, line, calls[] → endpoint method + path).

### 4. Graph merge (`merge_graph.py`)
- Match frontend calls to backend routes by method + normalized path pattern.
- Output `graph.json`: component → endpoint → handler → functions → tables, with file and line for every node.

### 5. Click overlay
- Holding Alt highlights the element under the cursor (outline box drawn via `getBoundingClientRect`).
- Alt+click finds the nearest ancestor with `data-source`, prevents the default action, and sends `{source: "path:line", component}` to the X-Ray UI via `postMessage` (X-Ray UI opened alongside, or in an iframe/side panel).
- Only active in dev/demo builds.

### 6. X-Ray API
- `GET /graph`: the full graph.
- `GET /trace?source=path:line`: resolve to a component and return its chain with code snippets (read from files using line ranges).
- `POST /explain`: given a chain, call the LLM and return step-by-step explanations. The prompt must only use provided snippets; one or two plain sentences per step plus why the step exists. Cache results by chain hash (file or SQLite).
- CORS configured for the UI and demo app origins.
- API key read from environment only.

### 7. X-Ray UI
- Listens for overlay messages; also has a component dropdown as a fallback.
- React Flow diagram of the chain (one node per layer, colored by layer type).
- Clicking a node shows its code snippet with syntax highlighting and file:line.
- Explanation panel with the AI steps; loading, empty and error states.
- "Repo map" tab listing every component and its endpoints.

## Constraints
- Free tools and free tiers only.
- Never commit API keys, passwords or `.env`; provide `.env.example`.
- Credit all third-party libraries, models and any adapted code in the README.
- Keep the analyzers working on the demo app first; other codebases are a stretch goal.

## Acceptance criteria
- Alt+clicking Checkout in the demo app shows the full chain down to the `Order` and `OrderItem` tables, with correct file:line for each step, a diagram, snippets and an AI explanation.
- The same works for at least 4 other buttons in the demo app.
- Unknown or untraceable elements show a clear message instead of crashing.
- Runs locally with documented commands and is deployed with a public link.

## README must include (hackathon requirements)
- Project title and description: problem, solution, who it helps
- Live demo link and demo video or screenshots
- AI implementation: model used, how it is prompted, how hallucination is limited
- Setup instructions, features, technologies used
- My contribution: what I built, what I learned, and which AI coding tools were used
- Credits for third-party code, libraries and models

## Cut list if short on time (cut from the top)
1. Repo map tab
2. Second level of call following
3. Click overlay (keep the component dropdown)
4. React Flow diagram (use a numbered list)

Never cut: the end-to-end trace, the AI explanation, the live link.
