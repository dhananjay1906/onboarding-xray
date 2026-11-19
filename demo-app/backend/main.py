import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import orders, products
from seed import seed

DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


def get_allowed_origins() -> list[str]:
    """Comma-separated ALLOWED_ORIGINS env var; defaults to the local Vite dev server."""
    raw = os.getenv("ALLOWED_ORIGINS") or DEFAULT_ORIGINS
    return [o.strip() for o in raw.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()  # creates tables and seeds products if empty (hosts that wipe SQLite)
    yield


app = FastAPI(title="Demo Store API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
