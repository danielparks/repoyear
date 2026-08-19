// API request/response schemas.
//
// These mirror backend/src/api/definition.rs's types, and must keep
// producing an OpenAPI spec the frontend's `npm run generate:api` (which
// codegens src/api/*.ts from src/api/openapi.json) can consume without
// frontend changes.

import { z } from "@hono/zod-openapi";

export const HealthResponseSchema = z
  .object({
    status: z.string().openapi({
      description:
        'Health status (always `"ok"`). This indicates that the API ' +
        "server is up and nothing more.",
    }),
  })
  .openapi("HealthResponse");

export const VersionResponseSchema = z
  .object({
    version: z.string().openapi({
      description: "Version string from git describe.",
    }),
  })
  .openapi("VersionResponse");

export const LocalContributionsSchema = z.record(
  z.string(),
  z.array(z.number().int()),
);

export const ContributionsResponseSchema = z
  .object({
    repos: LocalContributionsSchema.openapi({
      description:
        "Repository commit times (seconds since epoch) by repository name.",
    }),
  })
  .openapi("ContributionsResponse");

export const CallbackQuerySchema = z.object({
  code: z.string().openapi({
    description: "The code from GitHub.",
  }),
});

export const RefreshQuerySchema = z.object({
  refresh_token: z.string().openapi({
    description: "The refresh token from GitHub.",
  }),
});

export const OAuthTokenResponseSchema = z
  .object({
    access_token: z.string().openapi({
      description: "The access token from GitHub.",
    }),
    refresh_token: z.string().optional().openapi({
      description:
        "The refresh token from GitHub (if tokens are set to expire).",
    }),
    expires_in: z.number().int().nonnegative().optional().openapi({
      description: "Number of seconds until the access token expires.",
    }),
    refresh_token_expires_in: z.number().int().nonnegative().optional()
      .openapi({
        description: "Number of seconds until the refresh token expires.",
      }),
  })
  .openapi("OAuthTokenResponse");

export const ErrorResponseSchema = z
  .object({
    message: z.string(),
    request_id: z.string(),
    error_code: z.string().optional(),
  })
  .openapi("Error");
