import { Link } from "react-router-dom";
import { useCart } from "../cart";

export default function Header() {
  const { count } = useCart();
  return (
    <header className="header">
      <Link to="/" className="logo">
        🛍️ Demo Store
      </Link>
      <nav>
        <Link to="/">Products</Link>
        <Link to="/orders">Orders</Link>
        <Link to="/cart" className="cart-link">
          Cart ({count})
        </Link>
      </nav>
    </header>
  );
}
