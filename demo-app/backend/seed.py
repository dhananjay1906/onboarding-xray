from sqlmodel import Session, select

from database import engine, init_db
from models import Product

PRODUCTS = [
    ("Mechanical Keyboard", "Tactile switches, hot-swappable.", 8999, "⌨️"),
    ("Wireless Mouse", "Ergonomic, 70-hour battery.", 3499, "🖱️"),
    ("USB-C Hub", "7-in-1 with HDMI and SD reader.", 4999, "🔌"),
    ("Desk Lamp", "Dimmable LED with warm mode.", 2999, "💡"),
    ("Noise-Canceling Headphones", "Over-ear, 30-hour battery.", 15999, "🎧"),
    ("Laptop Stand", "Aluminium, adjustable height.", 3999, "💻"),
]


def seed(db_engine=engine) -> bool:
    """Create tables and insert sample products if the table is empty. Returns True if seeded."""
    init_db(db_engine)
    with Session(db_engine) as session:
        if session.exec(select(Product)).first():
            return False
        for name, desc, price, emoji in PRODUCTS:
            session.add(Product(name=name, description=desc, price_cents=price, image_emoji=emoji))
        session.commit()
        return True


if __name__ == "__main__":
    print(f"Seeded {len(PRODUCTS)} products." if seed() else "Products already seeded.")
