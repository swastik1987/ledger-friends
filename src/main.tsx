import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// A tab left open across a new deploy still holds the old build's hashed
// chunk filenames (e.g. React.lazy route imports in App.tsx). Those files
// no longer exist once the new build replaces them, so the dynamic import
// 404s and Vite fires this event instead of throwing into the component
// tree (where there's no error boundary to catch it) — reload once to pick
// up the new build's index.html + matching chunks. The reload flag is
// cleared as soon as this module runs successfully, so a future occurrence
// in a later session still gets its own retry rather than being silently
// swallowed forever.
const CHUNK_RELOAD_FLAG = "expensesync-chunk-reload";
sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return;
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
