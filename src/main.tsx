import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import QueryCacheProvider from "./components/QueryCache.tsx";
import App from "./App.tsx";

/** Parse all URL parameters and clean the URL. */
function parseUrlParams() {
  const params = new URLSearchParams(location.search);

  const code = params.get("code");
  const authError = params.get("error_description");
  const state = params.get("state");
  let user = params.get("user");

  // Restore username from OAuth state parameter if not already in the URL.
  if (!user && state) {
    user = state;
  }

  // Clean the URL: keep only ?user=... if present.
  if (params.has("code") || params.has("error") || params.has("state")) {
    const cleanParams = new URLSearchParams();
    if (user) {
      cleanParams.set("user", user);
    }
    const clean = cleanParams.toString();
    const cleanUrl = location.pathname + (clean ? `?${clean}` : "");
    history.replaceState({}, document.title, cleanUrl);
  }

  return { username: user, authCode: code, authError: authError };
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
