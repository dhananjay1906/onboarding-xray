import sys
import textwrap
from pathlib import Path

import pytest

ANALYZER_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ANALYZER_DIR.parent
sys.path.insert(0, str(ANALYZER_DIR))

from backend_ast import analyze, join_path  # noqa: E402


def make_app(tmp_path: Path, files: dict) -> dict:
    for name, source in files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(source), encoding="utf-8")
    return analyze(tmp_path, repo_root=tmp_path)


def route(result: dict, route_id: str) -> dict:
    return next(r for r in result["routes"] if r["id"] == route_id)


def test_join_path():
    assert join_path("/api", "/orders", "") == "/api/orders"
    assert join_path("", "", "") == "/"
    assert join_path("/api/", "/{id}") == "/api/{id}"


def test_routes_with_router_and_include_prefixes(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            from fastapi import FastAPI
            from routers import orders

            app = FastAPI()
            app.include_router(orders.router, prefix="/api")

            @app.get("/health")
            def health():
                return {"ok": True}
        """,
        "routers/__init__.py": "",
        "routers/orders.py": """
            from fastapi import APIRouter

            router = APIRouter(prefix="/orders")

            @router.get("")
            def list_orders():
                return []

            @router.post("", status_code=201)
            def create_order():
                return {}

            @router.get("/{order_id}")
            def get_order(order_id: int):
                return {}
        """,
    })
    ids = {r["id"] for r in result["routes"]}
    assert ids == {"GET /health", "GET /api/orders", "POST /api/orders", "GET /api/orders/{order_id}"}
    r = route(result, "GET /api/orders/{order_id}")
    assert r["method"] == "GET" and r["path"] == "/api/orders/{order_id}"
    assert r["handler"] == "routers/orders.py::get_order"


def test_include_router_via_from_import_and_nested_routers(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            from fastapi import FastAPI, APIRouter
            from routers.items import router as items_router

            app = FastAPI()
            v1 = APIRouter(prefix="/v1")
            v1.include_router(items_router, prefix="/shop")
            app.include_router(v1, prefix="/api")
        """,
        "routers/__init__.py": "",
        "routers/items.py": """
            from fastapi import APIRouter

            router = APIRouter(prefix="/items")

            @router.delete("/{item_id}")
            def remove_item(item_id: int):
                return None
        """,
    })
    assert [r["id"] for r in result["routes"]] == ["DELETE /api/v1/shop/items/{item_id}"]
    assert result["warnings"] == []


def test_router_without_include_keeps_own_prefix(tmp_path):
    result = make_app(tmp_path, {
        "r.py": """
            from fastapi import APIRouter
            router = APIRouter(prefix="/solo")

            @router.put("/x")
            def put_x():
                pass
        """,
    })
    assert [r["id"] for r in result["routes"]] == ["PUT /solo/x"]


def test_follows_calls_two_levels_and_stops(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            from fastapi import FastAPI
            import svc

            app = FastAPI()

            @app.get("/go")
            def go():
                return svc.level1()
        """,
        "svc.py": """
            def level1():
                return level2()

            def level2():
                return level3()

            def level3():
                return level4()

            def level4():
                return 1
        """,
    })
    r = route(result, "GET /go")
    depths = {f["id"].split("::")[1]: f["depth"] for f in r["functions"]}
    assert depths == {"level1": 1, "level2": 2}  # level3 is a third level: not followed
    assert {f["id"].split("::")[1]: f["parent"].split("::")[1] for f in r["functions"]} == {
        "level1": "go", "level2": "level1",
    }
    assert [(c["from"].split("::")[1], c["to"].split("::")[1]) for c in r["calls"]] == [
        ("go", "level1"), ("level1", "level2"),
    ]
    assert "level3" not in "".join(result["functions"])


def test_recursion_does_not_loop(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            from fastapi import FastAPI
            app = FastAPI()

            @app.get("/a")
            def a():
                return b()

            def b():
                return a()
        """,
    })
    r = route(result, "GET /a")
    assert [f["id"].split("::")[1] for f in r["functions"]] == ["b"]


def test_dynamic_and_unresolved_calls_marked_untraced(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            import os
            from fastapi import FastAPI, HTTPException
            import svc
            from svc import missing_name

            app = FastAPI()

            @app.get("/dyn")
            def dyn(callback, handlers):
                os.getcwd()                   # external library: ignored
                len([])                       # builtin: ignored
                HTTPException(status_code=400)  # external class: ignored
                callback()                    # callable in a parameter: dynamic
                handlers["x"]()               # subscript call: dynamic
                getattr(svc, "level1")()      # getattr: dynamic
                svc.does_not_exist()          # project module, no such function
                missing_name()                # project import that cannot be found
                svc.level1()                  # resolved
        """,
        "svc.py": """
            def level1():
                return 1
        """,
    })
    r = route(result, "GET /dyn")
    assert all(u["traced"] is False for u in r["untraced"])
    assert [u["expr"] for u in r["untraced"]] == [
        "callback", "handlers['x']", "getattr(svc, 'level1')", "svc.does_not_exist", "missing_name",
    ]
    assert [f["id"] for f in r["functions"]] == ["svc.py::level1"]


def test_detects_tables_and_operations(tmp_path):
    result = make_app(tmp_path, {
        "models/__init__.py": """
            from .thing import Thing, Other
            from .plain import Plain
        """,
        "models/thing.py": """
            from sqlmodel import SQLModel, Field

            class Thing(SQLModel, table=True):
                id: int | None = Field(default=None, primary_key=True)

            class Other(SQLModel, table=True):
                __tablename__ = "others"
                id: int | None = Field(default=None, primary_key=True)
        """,
        "models/plain.py": """
            from sqlmodel import SQLModel

            class Plain(SQLModel):
                name: str
        """,
        "main.py": """
            from fastapi import FastAPI
            from sqlmodel import select
            from models import Thing, Other, Plain

            app = FastAPI()

            @app.get("/things")
            def things(session):
                rows = session.exec(select(Thing).order_by(Thing.id)).all()
                one = session.get(Other, 1)
                Plain(name="x")   # not a table
                return rows, one

            @app.post("/things")
            def add_thing(session):
                session.add(Thing())
                session.commit()

            @app.get("/mention")
            def mention():
                return Thing.id   # only a reference, no query
        """,
    })
    assert set(result["tables"]) == {"Thing", "Other"}
    assert result["tables"]["Other"]["table_name"] == "others"
    assert result["tables"]["Thing"]["table_name"] == "thing"
    ops = lambda rid: {(t["table"], t["op"]) for t in route(result, rid)["tables"]}
    assert ops("GET /things") == {("Thing", "select"), ("Other", "get")}
    assert ops("POST /things") == {("Thing", "create")}
    assert ops("GET /mention") == set()


def test_tables_found_through_traced_functions_and_relative_imports(tmp_path):
    result = make_app(tmp_path, {
        "models/__init__.py": "from .item import Item\n",
        "models/item.py": """
            from sqlmodel import SQLModel

            class Item(SQLModel, table=True):
                id: int | None = None
        """,
        "services/__init__.py": "",
        "services/items.py": """
            from sqlmodel import select
            from models import Item

            def all_items(session):
                return session.exec(select(Item)).all()
        """,
        "main.py": """
            from fastapi import FastAPI
            from services import items

            app = FastAPI()

            @app.get("/items")
            def list_items(session):
                return items.all_items(session)
        """,
    })
    r = route(result, "GET /items")
    source_lines = (tmp_path / "services/items.py").read_text(encoding="utf-8").splitlines()
    (entry,) = r["tables"]
    assert (entry["table"], entry["op"], entry["via"]) == ("Item", "select", "services/items.py::all_items")
    assert "select(Item)" in source_lines[entry["line"] - 1]


def test_locations_and_snippets_match_source(tmp_path):
    source = textwrap.dedent("""
        from fastapi import FastAPI
        app = FastAPI()

        @app.get("/x")
        def handler():
            value = 1
            return value
    """)
    (tmp_path / "main.py").write_text(source, encoding="utf-8")
    result = analyze(tmp_path, repo_root=tmp_path)
    lines = source.splitlines()
    r = route(result, "GET /x")
    fn = result["functions"][r["handler"]]
    assert fn["file"] == "main.py"
    assert lines[fn["line"] - 1] == "def handler():"
    assert fn["snippet"] == "\n".join(lines[fn["line"] - 1:fn["end_line"]])
    assert fn["snippet"].endswith("return value")
    assert r["decorator"]["snippet"] == '@app.get("/x")'
    assert lines[r["decorator"]["line"] - 1] == '@app.get("/x")'


def test_skips_tests_dirs_and_reports_syntax_errors(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            from fastapi import FastAPI
            app = FastAPI()

            @app.get("/ok")
            def ok():
                pass
        """,
        "tests/test_x.py": """
            from fastapi import FastAPI
            app = FastAPI()

            @app.get("/from-tests")
            def t():
                pass
        """,
        "broken.py": "def oops(:\n",
    })
    assert [r["id"] for r in result["routes"]] == ["GET /ok"]
    assert any("broken.py" in w and "syntax error" in w for w in result["warnings"])


def test_non_literal_route_path_is_skipped_with_warning(tmp_path):
    result = make_app(tmp_path, {
        "main.py": """
            from fastapi import FastAPI
            app = FastAPI()
            PATH = "/x"

            @app.get(PATH)
            def x():
                pass
        """,
    })
    assert result["routes"] == []
    assert any("non-literal route path" in w for w in result["warnings"])


def test_demo_app_checkout_chain():
    result = analyze(REPO_ROOT / "demo-app" / "backend", repo_root=REPO_ROOT)
    assert {r["id"] for r in result["routes"]} == {
        "GET /api/products", "GET /api/products/{product_id}", "POST /api/orders", "GET /api/orders",
    }
    r = route(result, "POST /api/orders")
    assert r["handler"] == "demo-app/backend/routers/orders.py::create_order"
    assert [(f["id"], f["depth"]) for f in r["functions"]] == [
        ("demo-app/backend/services/order_service.py::place_order", 1),
    ]
    assert {(t["table"], t["op"]) for t in r["tables"]} == {
        ("Order", "create"), ("OrderItem", "create"), ("Product", "get"),
    }
    assert r["untraced"] == []
    assert set(result["tables"]) == {"Order", "OrderItem", "Product"}
    handler = result["functions"][r["handler"]]
    source = (REPO_ROOT / handler["file"]).read_text(encoding="utf-8").splitlines()
    assert source[handler["line"] - 1].startswith("def create_order(")
    assert handler["snippet"] == "\n".join(source[handler["line"] - 1:handler["end_line"]])


@pytest.mark.parametrize("rid,expected", [
    ("GET /api/orders", {"Order", "OrderItem"}),
    ("GET /api/products", {"Product"}),
])
def test_demo_app_list_routes_reach_tables(rid, expected):
    result = analyze(REPO_ROOT / "demo-app" / "backend", repo_root=REPO_ROOT)
    assert {t["table"] for t in route(result, rid)["tables"]} == expected
