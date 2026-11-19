from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from database import get_session
from services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderLine(BaseModel):
    product_id: int
    quantity: int


class OrderCreate(BaseModel):
    customer_name: str
    items: list[OrderLine]


def require_session_id(x_session_id: str = Header(default="")) -> str:
    """Anonymous per-browser id sent by the frontend; scopes orders to one visitor."""
    if not 8 <= len(x_session_id) <= 64:
        raise HTTPException(status_code=400, detail="Missing or invalid X-Session-Id header")
    return x_session_id


@router.post("", status_code=201)
def create_order(
    payload: OrderCreate,
    session: Session = Depends(get_session),
    session_id: str = Depends(require_session_id),
):
    try:
        order = order_service.place_order(
            session,
            session_id,
            payload.customer_name,
            [(line.product_id, line.quantity) for line in payload.items],
        )
    except order_service.OrderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return order


@router.get("")
def list_orders(
    session: Session = Depends(get_session),
    session_id: str = Depends(require_session_id),
):
    orders = order_service.list_orders(session, session_id)
    return [
        {**order.model_dump(), "items": order_service.get_order_items(session, order.id)}
        for order in orders
    ]
