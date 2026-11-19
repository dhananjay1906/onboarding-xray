from fastapi import APIRouter, Depends, HTTPException
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
    customer_email: str
    items: list[OrderLine]


@router.post("", status_code=201)
def create_order(payload: OrderCreate, session: Session = Depends(get_session)):
    try:
        order = order_service.place_order(
            session,
            payload.customer_name,
            payload.customer_email,
            [(line.product_id, line.quantity) for line in payload.items],
        )
    except order_service.OrderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return order


@router.get("")
def list_orders(session: Session = Depends(get_session)):
    orders = order_service.list_orders(session)
    return [
        {**order.model_dump(), "items": order_service.get_order_items(session, order.id)}
        for order in orders
    ]
