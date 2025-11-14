// Backend server to handle GitHub OAuth.
// Run with: deno run server

const CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Error: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set.\n" +
      "Create an .env file with these or pass environment variables.",
  );
  Deno.exit(1);
}

async function handleRequest(req: Request): Promise<Response> {
  // Response headers with CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  const url = new URL(req.url);

  // OAuth callback endpoint
  if (url.pathname === "/api/oauth/callback") {
    const code = url.searchParams.get("code");

    if (!code) {
      return new Response(
        JSON.stringify({ error: "No code provided" }),
        { status: 400, headers },
      );
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
          }),
        },
      );

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        // FIXME? is it dangerous to return error_description?
        return new Response(
          JSON.stringify({
            error: tokenData.error_description || "Authentication failed",
          }),
          { status: 400, headers },
        );
      }

      return new Response(
        JSON.stringify({ access_token: tokenData.access_token }),
        { status: 200, headers },
      );
    } catch (error) {
      console.error("OAuth error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers },
      );
    }
  }

  // Health check endpoint
  if (url.pathname === "/api/health") {
    return new Response(
      JSON.stringify({ status: "ok" }),
      { status: 200, headers },
    );
  }

  return new Response(
    JSON.stringify({ error: "Not found" }),
    { status: 404, headers },
  );
}

Deno.serve({ port: 3000 }, handleRequest);
