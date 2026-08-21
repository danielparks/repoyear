// Test helpers for mocking GitHub API responses.

/**
 * A GitHub-shaped JSON response. Real responses from
 * https://github.com/login/oauth/access_token always include `scope`
 * (empty for GitHub Apps) and a `date` header -- @octokit/oauth-methods
 * reads both unconditionally, and throws if they're missing.
 */
export function githubResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ scope: "", ...body }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "date": new Date().toUTCString(),
    },
  });
}
