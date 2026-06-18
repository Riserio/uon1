import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installRealtimeVisibilityPause } from "./lib/realtimeVisibility";

// Auto-reload on stale chunk errors (after a new deploy, the cached index.html
// references hashed chunks that no longer exist on the server).
const RELOAD_KEY = "__chunk_reload_at";
const handleChunkError = (msg?: string) => {
  if (!msg) return;
  const isChunkError =
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg);
  if (!isChunkError) return;
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10000) return; // avoid reload loops
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  // Force cache bypass: append a cache-buster query param so the browser
  // re-fetches index.html and the new hashed chunk references.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_cb", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};
window.addEventListener("error", (e) => handleChunkError(e?.message));
window.addEventListener("unhandledrejection", (e: any) =>
  handleChunkError(e?.reason?.message || String(e?.reason || ""))
);

installRealtimeVisibilityPause();

createRoot(document.getElementById("root")!).render(<App />);
