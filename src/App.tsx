import "./App.css";
import { useEffect, useState } from "react";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle OAuth callback. Runs only on mount.
  useEffect(() => {
    (async () => {
      if (accessToken) {
        return;
      }

      const code = new URLSearchParams(document.location.search).get("code");
      if (!code) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/oauth/callback", BACKEND_URL);
        url.searchParams.set("code", code);
        const response = await fetch(url);
        const data = await response.json() as { access_token?: string };

        if (data.access_token) {
          setAccessToken(data.access_token);
          localStorage.setItem("github_token", data.access_token);
          history.replaceState({}, document.title, "/");
        } else {
          setError("Failed to authenticate with GitHub");
        }
      } finally {
        setLoading(false);
      }
    })().catch((error: unknown) => {
      setError("Error during authentication");
      console.error(error);
    })
    // This should only run on mount, not when accessToken changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(): void {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    if (!clientId) {
      setError(
        "GitHub Client ID not found. Set VITE_GITHUB_CLIENT_ID in your .env file.",
      );
      return;
    }

    const redirect = new URL("https://github.com/login/oauth/authorize");
    redirect.searchParams.set("client_id", clientId);
    redirect.searchParams.set("redirect_uri", BASE_URL);
    redirect.searchParams.set("scope", "repo");
    document.location.href = redirect.href;
  }

  function logout(): void {
    setAccessToken(null);
    localStorage.removeItem("github_token");
  }

  if (loading) {
    return <b>Loading</b>;
  }

  if (accessToken === null) {
    return (
      <>
        {error && <h3>Error: {error}</h3>}
        <button type="button" onClick={login}>Log in</button>
      </>
    );
  }

  return (
    <>
      <h1>Test</h1>
      {error && <h3>Error: {error}</h3>}
      <pre>Access token: {accessToken}</pre>
      <button type="button" onClick={logout}>Log out</button>
    </>
  );
}
