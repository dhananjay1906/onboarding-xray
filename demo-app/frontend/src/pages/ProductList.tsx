import { useEffect, useState } from "react";
import { fetchProducts, type Product } from "../api";
import ProductCard from "../components/ProductCard";

export default function ProductList() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts().then(setProducts).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">Could not load products: {error}</p>;
  if (!products) return <p>Loading products…</p>;

  return (
    <section>
      <h1>Products</h1>
      <div className="grid">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
