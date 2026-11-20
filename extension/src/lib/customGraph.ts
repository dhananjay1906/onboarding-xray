// A graph.json the user loaded from their own project, kept in IndexedDB (shared by the welcome page and the side panel).
import type { Graph } from "./graph";

export interface CustomGraph {
  name: string;
  savedAt: number;
  graph: Graph;
}

const DB = "xray-graph";
const STORE = "kv";
const KEY = "custom";
const CHANNEL = "xray-graph-changed";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open storage"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Storage request failed"));
    });
  } finally {
    db.close();
  }
}

const notify = () => {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage("changed");
    ch.close();
  } catch {
    /* no BroadcastChannel: the panel picks the change up on its next load */
  }
};

export async function saveCustomGraph(name: string, graph: Graph): Promise<void> {
  await tx("readwrite", (s) => s.put({ name, savedAt: Date.now(), graph } satisfies CustomGraph, KEY));
  notify();
}

export async function readCustomGraph(): Promise<CustomGraph | null> {
  return ((await tx("readonly", (s) => s.get(KEY))) as CustomGraph | undefined) ?? null;
}

export async function clearCustomGraph(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
  notify();
}

/** Calls `cb` when the custom graph is loaded or cleared in another extension page. */
export function onGraphChanged(cb: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = () => cb();
  return () => ch.close();
}
