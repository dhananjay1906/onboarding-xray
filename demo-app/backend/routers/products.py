from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from database import get_session
from services import product_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
def list_products(session: Session = Depends(get_session)):
    return product_service.list_products(session)


@router.get("/{product_id}")
def get_product(product_id: int, session: Session = Depends(get_session)):
    product = product_service.get_product(session, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
