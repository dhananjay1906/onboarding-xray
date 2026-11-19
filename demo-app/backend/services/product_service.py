from typing import Optional

from sqlmodel import Session, select

from models import Product


def list_products(session: Session) -> list[Product]:
    return list(session.exec(select(Product)).all())


def get_product(session: Session, product_id: int) -> Optional[Product]:
    return session.get(Product, product_id)
