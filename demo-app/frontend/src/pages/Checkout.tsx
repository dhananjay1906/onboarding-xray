import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createOrder } from "../api";
import { useCart } from "../cart";
import { formatPrice } from "../format";

export default function Checkout() {
  const { lines, totalCents, clear } = useCart();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createOrder({
        customer_name: name,
        customer_email: email,
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      });
      clear();
      navigate("/orders");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <section>
        <h1>Checkout</h1>
        <p>Nothing to check out.</p>
        <Link to="/">Browse products</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>Checkout</h1>
      <p className="total">Order total: {formatPrice(totalCents)}</p>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Placing order…" : "Place order"}
        </button>
      </form>
    </section>
  );
}
