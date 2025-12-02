import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary.tsx";
import QueryCacheProvider from "./QueryCache.tsx";
import App from "./App.tsx";

export function Router() {
  const [username, setUsername] = useState<string | null>(() => {
    // Extract username from pathname (e.g., /username)
    const path = window.location.pathname;
    const match = path.match(/^\/([^/]+)$/);
    return match ? match[1] : null;
  });

  useEffect(() => {
    // Listen for navigation events (back/forward buttons)
    const handlePopState = () => {
      const path = window.location.pathname;
      const match = path.match(/^\/([^/]+)$/);
      setUsername(match ? match[1] : null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return <App username={username} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryCacheProvider>
        <Router />
      </QueryCacheProvider>
    </ErrorBoundary>
  </StrictMode>,
);
