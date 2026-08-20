import { assertEquals } from "@std/assert";
import { exchangeOAuthToken, refreshOAuthToken } from "./github.ts";
import { createLogger, Level } from "../logging.ts";

const credentials = {
  githubClientId: "client-id",
  githubClientSecret: "client-secret",
};

const silentLogger = createLogger(Level.Silent);

/**
 * A GitHub-shaped JSON response. Real responses from
 * https://github.com/login/oauth/access_token always include `scope`
 * (empty for GitHub Apps, which don't use OAuth scopes) and a `date`
 * header -- @octokit/oauth-methods reads both unconditionally, and throws
 * if they're missing.
 */
function githubResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ scope: "", ...body }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "date": new Date().toUTCString(),
    },
  });
}

function withFetch<T>(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("exchangeOAuthToken success, expiring token", async () => {
  const result = await withFetch(
    (_input, init) => {
      const body = JSON.parse(init?.body as string);
      assertEquals(body, {
        client_id: "client-id",
        client_secret: "client-secret",
        code: "the-code",
      });
      return Promise.resolve(
        githubResponse({
          access_token: "abc123",
          token_type: "bearer",
          refresh_token: "refresh123",
          expires_in: 28_800,
          refresh_token_expires_in: 15_897_600,
        }),
      );
    },
    () => exchangeOAuthToken(credentials, "the-code", silentLogger),
  );

  assertEquals(result, {
    ok: true,
    value: {
      access_token: "abc123",
      refresh_token: "refresh123",
      expires_in: 28_800,
      refresh_token_expires_in: 15_897_600,
    },
  });
});

Deno.test("exchangeOAuthToken success, non-expiring token", async () => {
  const result = await withFetch(
    () =>
      Promise.resolve(
        githubResponse({ access_token: "abc123", token_type: "bearer" }),
      ),
    () => exchangeOAuthToken(credentials, "the-code", silentLogger),
  );

  assertEquals(result, {
    ok: true,
    value: {
      access_token: "abc123",
      refresh_token: undefined,
      expires_in: undefined,
      refresh_token_expires_in: undefined,
    },
  });
});

Deno.test("exchangeOAuthToken GitHub-declared error", async () => {
  const result = await withFetch(
    () =>
      Promise.resolve(
        githubResponse({
          error: "bad_verification_code",
          error_description: "The code passed is incorrect or expired.",
          error_uri: "https://docs.github.com/apps/managing-oauth-apps",
        }),
      ),
    () => exchangeOAuthToken(credentials, "bad-code", silentLogger),
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(
      result.error,
      "The code passed is incorrect or expired. (bad_verification_code, " +
        "https://docs.github.com/apps/managing-oauth-apps)",
    );
  }
});

Deno.test("exchangeOAuthToken network failure returns a generic error", async () => {
  const result = await withFetch(
    () => Promise.reject(new Error("network down")),
    () => exchangeOAuthToken(credentials, "code", silentLogger),
  );

  assertEquals(result, {
    ok: false,
    error: "Service temporarily unavailable",
  });
});

Deno.test("exchangeOAuthToken HTTP failure returns a generic error", async () => {
  const result = await withFetch(
    () => Promise.resolve(new Response("bad gateway", { status: 502 })),
    () => exchangeOAuthToken(credentials, "code", silentLogger),
  );

  assertEquals(result, {
    ok: false,
    error: "Service temporarily unavailable",
  });
});

Deno.test("refreshOAuthToken sends grant info and returns the new token", async () => {
  const result = await withFetch(
    (_input, init) => {
      const body = JSON.parse(init?.body as string);
      assertEquals(body, {
        client_id: "client-id",
        client_secret: "client-secret",
        grant_type: "refresh_token",
        refresh_token: "the-refresh-token",
      });
      return Promise.resolve(
        githubResponse({
          access_token: "new-token",
          token_type: "bearer",
          refresh_token: "new-refresh-token",
          expires_in: 28_800,
          refresh_token_expires_in: 15_897_600,
        }),
      );
    },
    () => refreshOAuthToken(credentials, "the-refresh-token", silentLogger),
  );

  assertEquals(result, {
    ok: true,
    value: {
      access_token: "new-token",
      refresh_token: "new-refresh-token",
      expires_in: 28_800,
      refresh_token_expires_in: 15_897_600,
    },
  });
});

Deno.test("refreshOAuthToken surfaces a GitHub-declared error", async () => {
  const result = await withFetch(
    () =>
      Promise.resolve(
        githubResponse({
          error: "bad_refresh_token",
          error_description:
            "The refresh token passed is incorrect or expired.",
          error_uri: "https://docs.github.com/apps/managing-oauth-apps",
        }),
      ),
    () => refreshOAuthToken(credentials, "bad-refresh-token", silentLogger),
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(
      result.error,
      "The refresh token passed is incorrect or expired. " +
        "(bad_refresh_token, https://docs.github.com/apps/managing-oauth-apps)",
    );
  }
});
