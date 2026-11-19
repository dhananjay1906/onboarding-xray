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

function newSessionId(): string {
  // randomUUID only exists in secure contexts (https/localhost).
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function getSessionId(): string {
  try {
    let id = localStorage.getItem("xray-session-id");
    if (!id) {
      id = newSessionId();
      localStorage.setItem("xray-session-id", id);
    }
    return id;
  } catch {
    memorySessionId ??= newSessionId();
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
    // FastAPI validation errors (422) send a list in `detail`, not a string.
    const detail = typeof body.detail === "string" ? body.detail : null;
    throw new Error(detail ?? (res.status === 404 ? "Not found" : `Request failed (${res.status})`));
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
