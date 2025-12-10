/* eslint-disable */

    import type { FetchParams, FullParams, ApiResult } from "./http-client";
    import { dateReplacer, handleResponse, mergeParams, toQueryString } from './http-client'
    import { snakeify } from './util'

    export type { ApiResult, ErrorBody, ErrorResult } from './http-client'
    
/**
* Response from `/api/oauth/callback`
 */
export type CallbackSuccessResponse =
{
/** The access token from GitHub. */
"accessToken": string,};

/**
* Response from `/api/health`
 */
export type HealthResponse =
{
/** Health status (always `"ok"`). */
"status": string,};

export interface OauthCallbackQueryParams {
  code: string,
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
      apiVersion = "0.1.0";

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
         return this.request<CallbackSuccessResponse>({
           path: `/api/oauth/callback`,
           method: "GET",
  query,
  ...params,
         })
      },
}
     ws = {
  }
     }

   export default Api;
