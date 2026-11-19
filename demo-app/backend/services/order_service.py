from sqlmodel import Session, select

from models import Order, OrderItem, Product


class OrderError(Exception):
    pass


def place_order(
    session: Session,
    customer_name: str,
    customer_email: str,
    items: list[tuple[int, int]],
) -> Order:
    """Create an Order and its OrderItems. items = [(product_id, quantity)]."""
    if not items:
        raise OrderError("Cart is empty")

    order = Order(customer_name=customer_name, customer_email=customer_email, total_cents=0)
    session.add(order)
    session.flush()  # assigns order.id

    total = 0
    for product_id, quantity in items:
        product = session.get(Product, product_id)
        if product is None:
            session.rollback()
            raise OrderError(f"Product {product_id} not found")
        if quantity < 1 or quantity > product.stock:
            session.rollback()
            raise OrderError(f"Invalid quantity for {product.name}")
        product.stock -= quantity
        session.add(product)
        session.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=quantity,
                unit_price_cents=product.price_cents,
            )
        )
        total += product.price_cents * quantity

    order.total_cents = total
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def list_orders(session: Session) -> list[Order]:
    return list(session.exec(select(Order).order_by(Order.id.desc())).all())


def get_order_items(session: Session, order_id: int) -> list[OrderItem]:
    return list(session.exec(select(OrderItem).where(OrderItem.order_id == order_id)).all())
