/* eslint-disable */

    import type { FetchParams, FullParams, ApiResult } from "./http-client.ts";
    import { dateReplacer, handleResponse, mergeParams, toQueryString } from './http-client.ts'
    import { snakeify } from './util.ts'

    export type { ApiResult, ErrorBody, ErrorResult } from './http-client.ts'
    
/**
* Response from `/api/health`
 */
export type HealthResponse =
{
/** Health status (always `"ok"`).

This indicates that the API server is up and nothing more. */
"status": string,};

/**
* Response from OAuth token endpoints (`/api/oauth/callback` and `/api/oauth/refresh`).
 */
export type OAuthTokenResponse =
{
/** The access token from GitHub. */
"accessToken": string,
/** Number of seconds until the access token expires. */
"expiresIn"?: number | null,
/** The refresh token from GitHub (for GitHub Apps with token expiration). */
"refreshToken"?: string | null,
/** Number of seconds until the refresh token expires. */
"refreshTokenExpiresIn"?: number | null,};

/**
* Response from `/api/version`
 */
export type VersionResponse =
{
/** Version string from git describe. */
"version": string,};

export interface OauthCallbackQueryParams {
  code: string,
}

export interface OauthRefreshQueryParams {
  refreshToken: string,
}

type EmptyObj = Record<string, never>;
export interface ApiConfig {
      /**
       * No host means requests will be sent to the current host. This is used in
       * the web console.
       */
      host?: string;
      token?: string;
      baseParams?: FetchParams;
    }

    export class Api {
      host: string;
      token?: string;
      baseParams: FetchParams;
      /**
       * Pulled from info.version in the OpenAPI schema. Sent in the
       * `api-version` header on all requests.
       */
      apiVersion = "0.6.0";

      constructor({ host = "", baseParams = {}, token }: ApiConfig = {}) {
        this.host = host;
        this.token = token;

        const headers = new Headers({
          "Content-Type": "application/json",
          "api-version": this.apiVersion,
        });

        if (token) headers.append("Authorization", `Bearer ${token}`);

        this.baseParams = mergeParams({ headers }, baseParams);
      }

      public async request<Data>({
        body,
        path,
        query,
        host,
        ...fetchParams
      }: FullParams): Promise<ApiResult<Data>> {
        const url = (host || this.host) + path + toQueryString(query);
        const init = {
          ...mergeParams(this.baseParams, fetchParams),
          body: JSON.stringify(snakeify(body), dateReplacer),
        };
        return handleResponse(await fetch(url, init));
      }
       
      methods = {
/**
* Handle `/api/health`
 */
healthCheck: (_: EmptyObj,
params: FetchParams = {}) => {
         return this.request<HealthResponse>({
           path: `/api/health`,
           method: "GET",
  ...params,
         })
      },
/**
* Handle `/api/oauth/callback`
 */
oauthCallback: ({ 
query, }: {query: OauthCallbackQueryParams,
},
params: FetchParams = {}) => {
         return this.request<OAuthTokenResponse>({
           path: `/api/oauth/callback`,
           method: "GET",
  query,
  ...params,
         })
      },
/**
* Handle `/api/oauth/refresh`
 */
oauthRefresh: ({ 
query, }: {query: OauthRefreshQueryParams,
},
params: FetchParams = {}) => {
         return this.request<OAuthTokenResponse>({
           path: `/api/oauth/refresh`,
           method: "GET",
  query,
  ...params,
         })
      },
/**
* Handle `/api/version`
 */
version: (_: EmptyObj,
params: FetchParams = {}) => {
         return this.request<VersionResponse>({
           path: `/api/version`,
           method: "GET",
  ...params,
         })
      },
}
     ws = {
  }
     }

   export default Api;
