from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True)
    customer_name: str
    total_cents: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="order.id")
    product_id: int = Field(foreign_key="product.id")
    quantity: int
    unit_price_cents: int
