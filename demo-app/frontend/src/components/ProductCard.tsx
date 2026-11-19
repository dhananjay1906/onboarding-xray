import { Link } from "react-router-dom";
import type { Product } from "../api";
import { useCart } from "../cart";
import { formatPrice } from "../format";

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  return (
    <article className="card">
      <Link to={`/products/${product.id}`} className="card-link">
        <div className="emoji">{product.image_emoji}</div>
        <h3>{product.name}</h3>
      </Link>
      <p className="price">{formatPrice(product.price_cents)}</p>
      <button className="btn" onClick={() => add(product)}>
        Add to cart
      </button>
    </article>
  );
}
