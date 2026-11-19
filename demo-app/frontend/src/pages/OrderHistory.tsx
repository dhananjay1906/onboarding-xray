import { useEffect, useState } from "react";
import { fetchOrders, type Order } from "../api";
import { formatPrice } from "../format";

export default function OrderHistory() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders().then(setOrders).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">Could not load orders: {error}</p>;
  if (!orders) return <p>Loading orders…</p>;

  return (
    <section>
      <h1>Order history</h1>
      {orders.length === 0 && <p>No orders yet.</p>}
      {orders.map((o) => (
        <div key={o.id} className="order">
          <strong>Order #{o.id}</strong> · {new Date(o.created_at).toLocaleString()} · {o.customer_name}
          <div>
            {o.items?.length ?? 0} line(s) · {formatPrice(o.total_cents)}
          </div>
        </div>
      ))}
    </section>
  );
}
