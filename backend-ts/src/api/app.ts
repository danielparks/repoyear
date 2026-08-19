// Hono app: wires routes to handlers.
//
// Dropshot's trait-based split (definition/implementation/mock) existed to
// generate an OpenAPI spec without compiling the OAuth implementation --
// that's not a constraint here, so this collapses to one app factory.
// Tests inject an `AppState` directly rather than swapping implementations.

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  CallbackQuerySchema,
  ContributionsResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  OAuthTokenResponseSchema,
  RefreshQuerySchema,
  VersionResponseSchema,
} from "./schemas.ts";
import { exchangeOAuthToken, refreshOAuthToken } from "./github.ts";
import { getContributions } from "./handlers.ts";
import type { AppState } from "./handlers.ts";

function errorBody(message: string): { message: string; request_id: string } {
  return { message, request_id: crypto.randomUUID() };
}

const healthRoute = createRoute({
  method: "get",
  path: "/api/health",
  summary: "Handle `/api/health`",
  responses: {
    200: {
      description: "successful operation",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
  },
});

const versionRoute = createRoute({
  method: "get",
  path: "/api/version",
  summary: "Handle `/api/version`",
  responses: {
    200: {
      description: "successful operation",
      content: { "application/json": { schema: VersionResponseSchema } },
    },
  },
});

const contributionsRoute = createRoute({
  method: "get",
  path: "/api/contributions",
  summary: "Handle `/api/contributions`",
  responses: {
    200: {
      description: "successful operation",
      content: {
        "application/json": { schema: ContributionsResponseSchema },
      },
    },
  },
});

const oauthCallbackRoute = createRoute({
  method: "get",
  path: "/api/oauth/callback",
  summary: "Handle `/api/oauth/callback`",
  request: { query: CallbackQuerySchema },
  responses: {
    200: {
      description: "successful operation",
      content: { "application/json": { schema: OAuthTokenResponseSchema } },
    },
    400: {
      description: "Error",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

const oauthRefreshRoute = createRoute({
  method: "get",
  path: "/api/oauth/refresh",
  summary: "Handle `/api/oauth/refresh`",
  request: { query: RefreshQuerySchema },
  responses: {
    200: {
      description: "successful operation",
      content: { "application/json": { schema: OAuthTokenResponseSchema } },
    },
    400: {
      description: "Error",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export function createApp(state: AppState): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(healthRoute, (c) => c.json({ status: "ok" }));

  app.openapi(versionRoute, (c) => c.json({ version: state.version }));

  app.openapi(contributionsRoute, async (c) => {
    const repos = await getContributions(state);
    return c.json({ repos });
  });

  app.openapi(oauthCallbackRoute, async (c) => {
    const { code } = c.req.valid("query");
    const result = await exchangeOAuthToken(state, code, state.logger);
    if (!result.ok) {
      return c.json(errorBody(result.error), 400);
    }
    return c.json(result.value, 200);
  });

  app.openapi(oauthRefreshRoute, async (c) => {
    const { refresh_token } = c.req.valid("query");
    const result = await refreshOAuthToken(
      state,
      refresh_token,
      state.logger,
    );
    if (!result.ok) {
      return c.json(errorBody(result.error), 400);
    }
    return c.json(result.value, 200);
  });

  app.doc("/api/openapi.json", {
    openapi: "3.0.3",
    info: { title: "RepoYear API", version: state.version },
  });

  return app;
}
