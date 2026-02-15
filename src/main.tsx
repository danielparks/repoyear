import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import QueryCacheProvider from "./components/QueryCache.tsx";
import App from "./App.tsx";

/** Parse all URL parameters and clean the URL. */
function parseUrlParams() {
  const params = new URLSearchParams(location.search);

  // Example error URL from GitHub: http://localhost:5173/?error=access_denied&error_description=The+user+has+denied+your+application+access.&error_uri=https%3A%2F%2Fdocs.github.com%2Fapps%2Fmanaging-oauth-apps%2Ftroubleshooting-authorization-request-errors%2F%23access-denied
  const authCode = params.get("code");
  const authError = params.get("error_description");

  // Restore username from OAuth state parameter if not already in the URL.
  const username = params.get("state") ?? params.get("user");

  // Clean the URL: keep only ?user=... if present.
  if (params.has("code") || params.has("error") || params.has("state")) {
    const cleanParams = new URLSearchParams();
    if (username) {
      cleanParams.set("user", username);
    }
    const clean = cleanParams.toString();
    history.replaceState(
      {},
      document.title,
      location.pathname + (clean ? `?${clean}` : ""),
    );
  }

  return { username, authCode, authError };
}

function Router() {
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

  const { username, authCode, authError } = parseUrlParams();

  return (
    <App
      username={username}
      authCode={authCode}
      authError={authError}
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
