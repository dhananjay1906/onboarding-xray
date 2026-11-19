# Onboarding X-Ray — Project Spec (Firebase hybrid version)
 
## What we are building
Onboarding X-Ray is a Chrome extension that helps developers understand an unfamiliar web app. You Alt+click any element in a running app, and Chrome's side panel shows the full chain of code behind it:
 
React component → API call → FastAPI route → Python functions → database table
 
Each step gets a plain-English explanation from Firebase AI Logic hybrid inference. It runs on-device (Gemini Nano in Chrome) when available, so private code never leaves the laptop, and falls back to the cloud when it isn't.
 
Target hackathons:
- **#BuildHybridAI** (Devpost, platform: Web/Chrome). Requires Firebase AI Logic called at runtime, App Check, a public repo with an open-source license, and a YouTube demo video of 3 minutes or less.
- **Build Your First AI App 2026** (Devpost, AI Productivity Tools). Requires free tools only and a README with an AI disclosure.
## Hybrid story (the core idea)
- **On-device (default):** explain one step at a time from short code snippets. Private, free, works offline.
- **Cloud fallback:** used when the on-device model isn't downloaded or supported, or for long tasks (whole-chain summary, repo overview).
- **User control:** a privacy toggle that maps to SDK inference modes:
  - Private only → `InferenceMode.ONLY_ON_DEVICE`
  - Auto (default) → `InferenceMode.PREFER_ON_DEVICE`
  - Best quality → `InferenceMode.PREFER_IN_CLOUD`
- Every explanation shows which mode produced it (see Badge).
## Parts
1. **Demo store app**: a small React + FastAPI shop that X-Ray inspects.
2. **Analyzers** (build time, run once): scan the demo app's backend and frontend and produce `graph.json`, including the code snippets for every node.
3. **Chrome extension (MV3)**:
   - Content script: click overlay (Alt+hover highlight, Alt+click capture)
   - Side panel: X-Ray UI (flow diagram, snippets, explanations, badges, privacy toggle)
   - Welcome/onboarding page
   - Service worker: messaging, install events
4. **Firebase**: AI Logic (hybrid inference), App Check, Firestore, Remote Config, Hosting, Anonymous Auth.
There is no separate X-Ray backend. The extension reads `graph.json` and calls Firebase AI Logic directly from the browser.
 
## Tech stack (all free tiers)
| Area | Tool |
|---|---|
| Demo backend | Python 3.11+, FastAPI, SQLModel, SQLite |
| Demo frontend | React, TypeScript, Vite |
| Source tagging | Custom Vite/Babel plugin adding `data-source="path:line"` to JSX elements |
| Backend analyzer | Python `ast` module |
| Frontend analyzer | Node + `@babel/parser` + `@babel/traverse` |
| Extension build | Vite + TypeScript, Manifest V3 (CRXJS Vite plugin or multi-entry Vite config) |
| Extension UI | React, Tailwind CSS, React Flow (`@xyflow/react`), Shiki or Prism |
| AI | Firebase JS SDK `firebase/ai` (v12.5.0+): `getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`; Gemini Developer API as the cloud provider |
| App Check | Firebase App Check (debug token for development and submission; production provider if it works in the extension) |
| Database | Firestore: shared explanation cache, saved project graphs |
| Auth | Firebase Anonymous Auth (gives Firestore a user id without a sign-in screen) |
| Config | Firebase Remote Config: on-device prompt length limit, prompt version, default mode |
| Hosting | Firebase Hosting for the demo frontend; Render or Hugging Face Spaces for the demo FastAPI backend |
| Browser | Chrome desktop 139+ with the on-device model enabled |
 
## Repo structure
```
onboarding-xray/
├── demo-app/
│   ├── backend/            # FastAPI: routers/, services/, models/, seed.py, requirements.txt
│   └── frontend/           # React + Vite + data-source plugin
├── analyzer/
│   ├── backend_ast.py
│   ├── frontend_calls.ts
│   └── merge_graph.py      # writes graph.json with snippets embedded
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── content/        # overlay
│   │   ├── sidepanel/      # React X-Ray UI
│   │   ├── welcome/        # onboarding page
│   │   ├── background/     # service worker
│   │   └── lib/
│   │       ├── firebase.ts # init app, App Check, AI, Firestore, Remote Config, Auth
│   │       ├── explain.ts  # hybrid inference calls + mode detection
│   │       └── graph.ts    # load and query graph.json
│   └── public/graph.json   # bundled demo graph
├── firebase.json
├── firestore.rules
├── docs/                   # architecture diagram, screenshots
├── .env.example
├── LICENSE                 # Apache-2.0
└── README.md
```
 
## Component requirements
 
### 1. Demo store app
- Screens: product list, product detail, cart, checkout, order history.
- Backend layered on purpose: `routers/` → `services/` → `models/` (SQLModel `table=True`).
- Example chain that must work: Checkout button → `POST /api/orders` → `create_order()` → `order_service.place_order()` → `Order`, `OrderItem` tables.
- All frontend API calls live in `src/api.ts` (one function per endpoint), called from components.
- Seed script with sample products.
### 2. Backend analyzer (`backend_ast.py`)
- Walk all `.py` files under a given backend path.
- Detect FastAPI routes from decorators (`@app.*`, `@router.*`), including `APIRouter(prefix=...)` and `include_router(prefix=...)`. Record method, full path, handler, file, line.
- Follow direct calls from each handler up to 2 levels, resolving project imports. Mark dynamic or unresolved calls `"traced": false`.
- Detect SQLModel tables and the functions that touch them (`select(X)`, `X(...)` with `session.add`, `session.get(X, ...)`).
- Output `backend.json`.
### 3. Frontend analyzer (`frontend_calls.ts`)
- Parse `.ts`/`.tsx` files; find `fetch` / `axios.<method>` calls; extract method and URL; normalize template literals (`${id}` → `{param}`).
- Map `api.ts` functions to endpoints, and components to the `api.ts` functions they call.
- Output `frontend.json`.
### 4. Graph merge (`merge_graph.py`)
- Match frontend calls to backend routes by method + normalized path.
- Output `graph.json`: component → endpoint → handler → functions → tables, with file, line range and the code snippet text for every node.
- Copy the result to `extension/public/graph.json`.
### 5. Click overlay (content script)
- Active only on pages the user enables (the demo app's origin by default).
- Holding Alt highlights the element under the cursor (outline via `getBoundingClientRect`).
- Alt+click finds the nearest ancestor with `data-source`, prevents the default action, and sends `{source, component}` to the side panel via `chrome.runtime.sendMessage`.
- Elements without `data-source` show a small "not traced" tooltip instead of failing silently.
### 6. Side panel (X-Ray UI)
- Opens with `chrome.sidePanel`.
- Header: status pill (On-device ready / Downloading N% / Cloud only) and the privacy toggle (Private only / Auto / Best quality).
- Component dropdown as a fallback to clicking.
- React Flow diagram of the chain, one node per layer, colored by layer.
- Clicking a node shows its snippet with syntax highlighting and file:line.
- Step-by-step explanations, each with a badge (see below).
- "Summarize whole flow" button (long prompt, usually cloud).
- "Repo map" tab listing every component and its endpoints.
- Loading, empty and error states everywhere.
### 7. Hybrid inference (`explain.ts`)
- Initialize with `getAI(app, { backend: new GoogleAIBackend() })`.
- Create the model with the mode from the privacy toggle (`getGenerativeModel(ai, { mode })`).
- Call the on-device model initialization only after a user action (button click), as the Firebase docs require.
- One prompt per step: the step's snippet + its role in the chain. Instruct the model to explain only the provided code, in 1–2 plain sentences plus why the step exists.
- If a prompt exceeds the Remote Config length limit, use the cloud for that request.
- Detect which source (on-device or cloud) handled each response using the method described in the Firebase AI Logic hybrid "configuration options" docs, and return it with the text.
- Handle errors: `ONLY_ON_DEVICE` with no model → clear message and a button to download the model or switch to Auto.
### 8. Badge
- On-device result: green chip "On-device · private".
- Cloud result: blue chip "Cloud" plus the reason ("model not downloaded", "too long for on-device", "Best quality mode").
### 9. Firestore cache and Auth
- Sign in anonymously on first open.
- Cache key: hash of (snippet + prompt version + mode source). Store `{text, source, createdAt}`.
- Check the cache before calling the model.
- `firestore.rules`: authenticated users can read the cache and create entries; no updates or deletes from clients.
### 10. Remote Config
- `on_device_max_chars`, `prompt_version`, `default_mode`, with sensible in-app defaults.
### 11. Onboarding (welcome page)
- Opened automatically by `chrome.runtime.onInstalled`.
- Step 1, check setup: Chrome version and on-device model availability. Show a "Download on-device model" button with progress. Explain that Cloud mode works meanwhile.
- Step 2, try it: open the hosted demo store and prompt "Alt+click the Checkout button"; show success when the trace appears.
- Step 3, your project: how to run the analyzer and load your own `graph.json`.
- A "?" button in the side panel replays the tour.
### 12. Hosting and distribution
- Demo frontend on Firebase Hosting; demo backend on Render or Hugging Face Spaces.
- Extension published to the Chrome Web Store (submit early; review takes time). Fallback: GitHub release zip + "Load unpacked" guide with screenshots.
## Constraints
- Firebase AI Logic must be imported and actually called at runtime (hackathon rule).
- App Check must be set up; debug tokens are accepted.
- Never commit secrets: App Check debug tokens and any keys stay out of the repo. Firebase web config values are loaded from `.env` (`VITE_FIREBASE_*`).
- MV3: no remotely hosted code; bundle the Firebase SDK with Vite.
- Free tiers only; the app is free for users.
- Repo is public with an Apache-2.0 `LICENSE` file.
- Credit all third-party libraries, models and adapted code.
## Acceptance criteria
- Fresh install opens onboarding; a judge can reach a working trace in under 2 minutes.
- Alt+clicking Checkout shows the full chain to `Order` and `OrderItem`, with correct file:line, diagram, snippets and explanations.
- Works for at least 4 other buttons.
- With the on-device model available, Auto mode shows "On-device" badges; with it unavailable, the same flow works in Cloud with the reason shown.
- Private-only mode never sends a request to the cloud.
- Cached explanations load instantly on a second click.
- Unknown elements show a clear message instead of crashing.
## README must include
- Title, problem, solution, who it helps, value proposition
- How Firebase AI Logic hybrid inference is used (with code links), plus App Check, Firestore, Remote Config, Auth, Hosting
- Install steps (Web Store link + Load unpacked fallback) and Chrome setup for the on-device model
- Live demo link and YouTube demo video (3 minutes or less, English)
- How hallucination is limited (explains only the provided snippets)
- Setup for developers, features, technologies
- My contribution, what I learned, and the AI coding tools used
- Credits and license
## Cut list if short on time (cut from the top)
1. Repo map tab
2. Remote Config (hard-code defaults)
3. Firestore cache (keep an in-memory cache)
4. Second level of call following
5. React Flow diagram (use a numbered list)
Never cut: Firebase AI Logic hybrid calls, the badge, the privacy toggle, the end-to-end trace, onboarding step 1–2, the demo video.
 