import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from database import get_session
from main import app, get_allowed_origins
from models import Product
from seed import PRODUCTS, seed

SID_A = {"X-Session-Id": "session-aaaaaaaa"}
SID_B = {"X-Session-Id": "session-bbbbbbbb"}


def memory_engine():
    return create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )


@pytest.fixture
def client():
    engine = memory_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Product(name="Thing", price_cents=1000, stock=5))
        s.commit()

    def override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def order_body(items):
    return {"customer_name": "A", "items": items}


def test_products(client):
    r = client.get("/api/products")
    assert r.status_code == 200 and len(r.json()) == 1
    assert client.get("/api/products/1").json()["name"] == "Thing"
    assert client.get("/api/products/99").status_code == 404


def test_checkout_chain(client):
    r = client.post("/api/orders", headers=SID_A, json=order_body([{"product_id": 1, "quantity": 2}]))
    assert r.status_code == 201 and r.json()["total_cents"] == 2000
    assert "customer_email" not in r.json()
    orders = client.get("/api/orders", headers=SID_A).json()
    assert len(orders) == 1 and orders[0]["items"][0]["quantity"] == 2
    assert client.get("/api/products/1").json()["stock"] == 3


def test_orders_scoped_to_session(client):
    client.post("/api/orders", headers=SID_A, json=order_body([{"product_id": 1, "quantity": 1}]))
    assert len(client.get("/api/orders", headers=SID_A).json()) == 1
    assert client.get("/api/orders", headers=SID_B).json() == []


def test_session_header_required(client):
    body = order_body([{"product_id": 1, "quantity": 1}])
    assert client.get("/api/orders").status_code == 400
    assert client.post("/api/orders", json=body).status_code == 400
    assert client.get("/api/orders", headers={"X-Session-Id": "short"}).status_code == 400


def test_empty_and_bad_orders(client):
    assert client.post("/api/orders", headers=SID_A, json=order_body([])).status_code == 400
    bad_product = order_body([{"product_id": 9, "quantity": 1}])
    assert client.post("/api/orders", headers=SID_A, json=bad_product).status_code == 400
    too_many = order_body([{"product_id": 1, "quantity": 50}])
    assert client.post("/api/orders", headers=SID_A, json=too_many).status_code == 400
    assert client.get("/api/orders", headers=SID_A).json() == []


def test_seed_runs_when_empty_and_is_idempotent():
    engine = memory_engine()
    assert seed(engine) is True
    assert seed(engine) is False
    with Session(engine) as s:
        assert len(s.exec(select(Product)).all()) == len(PRODUCTS)


def test_allowed_origins_env(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert get_allowed_origins() == ["http://localhost:5173", "http://127.0.0.1:5173"]
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.web.app, https://b.example.com ,")
    assert get_allowed_origins() == ["https://a.web.app", "https://b.example.com"]
