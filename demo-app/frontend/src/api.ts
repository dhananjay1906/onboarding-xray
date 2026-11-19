// All backend calls live here: one function per endpoint.

export interface Product {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  image_emoji: string;
  stock: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_email: string;
  total_cents: number;
  created_at: string;
  items?: OrderItem[];
}

export interface NewOrder {
  customer_name: string;
  customer_email: string;
  items: { product_id: number; quantity: number }[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchProducts(): Promise<Product[]> {
  return request<Product[]>("/api/products");
}

export function fetchProduct(id: number): Promise<Product> {
  return request<Product>(`/api/products/${id}`);
}

export function createOrder(order: NewOrder): Promise<Order> {
  return request<Order>("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
}

export function fetchOrders(): Promise<Order[]> {
  return request<Order[]>("/api/orders");
}
