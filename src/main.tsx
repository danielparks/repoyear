import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import QueryCacheProvider from "./components/QueryCache.tsx";
import App from "./App.tsx";

export function Router() {
  const frontendUrl = import.meta.env.VITE_FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error(
      "Frontend URL not found; make sure VITE_FRONTEND_URL is set in your " +
        " .env file.",
    );
  }

  const githubClientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  if (!githubClientId) {
    throw new Error(
      "GitHub Client ID not found; make sure VITE_GITHUB_CLIENT_ID is set in " +
        " your .env file.",
    );
  }

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

  return (
    <App
      username={username}
      frontendUrl={frontendUrl}
      githubClientId={githubClientId}
    />
  );
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
