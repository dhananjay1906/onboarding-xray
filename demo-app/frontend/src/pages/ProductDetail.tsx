import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProduct, type Product } from "../api";
import { useCart } from "../cart";
import { formatPrice } from "../format";

export default function ProductDetail() {
  const { id } = useParams();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProduct(Number(id)).then(setProduct).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!product) return <p>Loading…</p>;

  return (
    <section className="detail">
      <Link to="/">← Back to products</Link>
      <div className="emoji big">{product.image_emoji}</div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <p className="price">{formatPrice(product.price_cents)}</p>
      <p className="muted">{product.stock} in stock</p>
      <button className="btn" onClick={() => add(product)} disabled={product.stock < 1}>
        Add to cart
      </button>
    </section>
  );
}
