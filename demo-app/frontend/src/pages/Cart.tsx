import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../cart";
import { formatPrice } from "../format";

export default function Cart() {
  const { lines, totalCents, setQuantity, remove, clear } = useCart();
  const navigate = useNavigate();

  if (lines.length === 0) {
    return (
      <section>
        <h1>Your cart</h1>
        <p>Your cart is empty.</p>
        <Link to="/">Browse products</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>Your cart</h1>
      <table className="table">
        <tbody>
          {lines.map(({ product, quantity }) => (
            <tr key={product.id}>
              <td>
                {product.image_emoji} {product.name}
              </td>
              <td>
                <button className="btn small" onClick={() => setQuantity(product.id, quantity - 1)}>
                  −
                </button>{" "}
                {quantity}{" "}
                <button className="btn small" onClick={() => setQuantity(product.id, quantity + 1)}>
                  +
                </button>
              </td>
              <td>{formatPrice(product.price_cents * quantity)}</td>
              <td>
                <button className="btn small ghost" onClick={() => remove(product.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="total">Total: {formatPrice(totalCents)}</p>
      <button className="btn ghost" onClick={clear}>
        Clear cart
      </button>{" "}
      <button className="btn" onClick={() => navigate("/checkout")}>
        Go to checkout
      </button>
    </section>
  );
}
