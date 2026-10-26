import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initTheme } from "@/lib/theme";

// Apply persisted theme BEFORE first paint to avoid flash
initTheme();

// Intercept all window.open calls to keep users inside Averia AI
const originalWindowOpen = window.open;
window.open = function (url?: string | URL, target?: string, features?: string) {
  if (url && typeof url === 'string' && url.startsWith('http')) {
    window.location.href = `/article?url=${encodeURIComponent(url)}&title=`;
    return null;
  }
  return originalWindowOpen.call(window, url, target, features);
};

createRoot(document.getElementById("root")!).render(<App />);
