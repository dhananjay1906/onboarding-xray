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
  total_cents: number;
  created_at: string;
  items?: OrderItem[];
}

export interface NewOrder {
  customer_name: string;
  items: { product_id: number; quantity: number }[];
}

// Empty by default: local dev goes through the Vite proxy. Set for hosted builds.
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

// Anonymous per-browser id; the backend scopes orders to it.
let memorySessionId: string | null = null;

function getSessionId(): string {
  try {
    let id = localStorage.getItem("xray-session-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("xray-session-id", id);
    }
    return id;
  } catch {
    memorySessionId ??= crypto.randomUUID();
    return memorySessionId;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, "X-Session-Id": getSessionId() },
  });
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
