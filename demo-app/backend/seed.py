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


def seed() -> None:
    init_db()
    with Session(engine) as session:
        if session.exec(select(Product)).first():
            print("Products already seeded.")
            return
        for name, desc, price, emoji in PRODUCTS:
            session.add(Product(name=name, description=desc, price_cents=price, image_emoji=emoji))
        session.commit()
        print(f"Seeded {len(PRODUCTS)} products.")


if __name__ == "__main__":
    seed()
