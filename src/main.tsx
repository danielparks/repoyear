import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import QueryCacheProvider from "./components/QueryCache.tsx";
import App from "./App.tsx";

export function Router() {
  function getUsernameParameter() {
    const match = location.pathname.match(/^\/([^/]+)$/);
    return match ? match[1] : null;
  }
  const [username, setUsername] = useState<string | null>(getUsernameParameter);

  useEffect(() => {
    // Listen for navigation events (back/forward buttons)
    const handlePopState = () => {
      setUsername(getUsernameParameter());
    };

    addEventListener("popstate", handlePopState);
    return () => {
      removeEventListener("popstate", handlePopState);
    };
  }, []);

  return <App username={username} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryCacheProvider>
        <Router />
      </QueryCacheProvider>
    </ErrorBoundary>
  </StrictMode>,
);
