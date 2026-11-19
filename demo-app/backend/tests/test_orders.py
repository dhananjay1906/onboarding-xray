import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from database import get_session
from main import app
from models import Product


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
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


def test_products(client):
    r = client.get("/api/products")
    assert r.status_code == 200 and len(r.json()) == 1
    assert client.get("/api/products/1").json()["name"] == "Thing"
    assert client.get("/api/products/99").status_code == 404


def test_checkout_chain(client):
    r = client.post(
        "/api/orders",
        json={"customer_name": "A", "customer_email": "a@b.c", "items": [{"product_id": 1, "quantity": 2}]},
    )
    assert r.status_code == 201 and r.json()["total_cents"] == 2000
    orders = client.get("/api/orders").json()
    assert len(orders) == 1 and orders[0]["items"][0]["quantity"] == 2
    assert client.get("/api/products/1").json()["stock"] == 3


def test_empty_and_bad_orders(client):
    base = {"customer_name": "A", "customer_email": "a@b.c"}
    assert client.post("/api/orders", json={**base, "items": []}).status_code == 400
    assert client.post("/api/orders", json={**base, "items": [{"product_id": 9, "quantity": 1}]}).status_code == 400
    assert client.post("/api/orders", json={**base, "items": [{"product_id": 1, "quantity": 50}]}).status_code == 400
    assert client.get("/api/orders").json() == []
