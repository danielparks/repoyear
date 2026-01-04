//! API contract definitions.
//!
//! This module contains the trait definitions and type signatures that define
//! the API surface. These are independent of any particular implementation.

use dropshot::{HttpError, HttpResponseOk, Query, RequestContext};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;

/// Response from `/api/health`
#[derive(Debug, Serialize, JsonSchema)]
pub struct HealthResponse {
    /// Health status (always `"ok"`).
    ///
    /// This indicates that the API server is up and nothing more.
    pub status: String,
}

/// Response from `/api/version`
#[derive(Debug, Serialize, JsonSchema)]
pub struct VersionResponse {
    /// Version string from git describe.
    pub version: String,
}

/// Response from `/api/contributions`
#[derive(Debug, Serialize, JsonSchema)]
pub struct ContributionsResponse {
    /// Repository commit times (seconds since epoch) by repository name.
    pub repos: HashMap<String, Vec<i64>>,
}

/// Parameters for `/api/oauth/callback`
#[derive(Debug, Deserialize, JsonSchema)]
pub struct CallbackParams {
    /// The code from GitHub.
    pub code: String,
}

/// Parameters for `/api/oauth/refresh`
#[derive(Debug, Deserialize, JsonSchema)]
pub struct RefreshParams {
    /// The refresh token from GitHub.
    pub refresh_token: String,
}

/// Response from OAuth endpoints
///
///   * `/api/oauth/callback`
///   * `/api/oauth/refresh`
#[derive(Debug, Serialize, JsonSchema)]
pub struct OAuthTokenResponse {
    /// The access token from GitHub.
    pub access_token: String,

    /// The refresh token from GitHub (if tokens are set to expire).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,

    /// Number of seconds until the access token expires.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<u64>,

    /// Number of seconds until the refresh token expires.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token_expires_in: Option<u64>,
}

/// Base trait defining the business logic for the API.
///
/// This trait contains the actual implementation methods that handle
/// the business logic for each endpoint. Implement this trait to provide
/// custom behavior (e.g., for testing with mocks).
pub trait ApiBase: Send + Sync {
    /// Check that the API server is up.
    ///
    /// If the API server is up, this always returns `{"status":"ok"}`. It
    /// intentionally does not check anything else.
    fn check_health(&self) -> impl Future<Output = String> + Send;

    /// Get the application version.
    fn get_version(&self) -> impl Future<Output = String> + Send;

    /// Get contributions for local repositories.
    fn get_contributions(
        &self,
        log: &slog::Logger,
    ) -> impl Future<Output = HashMap<String, Vec<i64>>> + Send;

    /// Exchange a GitHub OAuth code for an access token.
    ///
    /// # Errors
    ///
    /// Returns an error message if the OAuth exchange fails.
    fn exchange_oauth_token(
        &self,
        code: &str,
        log: &slog::Logger,
    ) -> impl Future<Output = Result<OAuthTokenResponse, String>> + Send;

    /// Refresh a GitHub OAuth access token using a refresh token.
    ///
    /// # Errors
    ///
    /// Returns an error message if the token refresh fails.
    fn refresh_oauth_token(
        &self,
        refresh_token: &str,
        log: &slog::Logger,
    ) -> impl Future<Output = Result<OAuthTokenResponse, String>> + Send;
}

/// API trait with endpoint definitions.
///
/// This trait defines the HTTP API surface using Dropshot’s endpoint
/// attributes. The default implementations delegate to the `ApiBase` trait,
/// allowing for multiple implementations (production, test, mock, etc.).
#[dropshot::api_description]
pub trait RepoYearApi {
    /// The context type must implement `ApiBase`.
    type Context: ApiBase;

    /// Handle `/api/health`
    #[endpoint {
        method = GET,
        path = "/api/health",
    }]
    async fn health_check(
        rqctx: RequestContext<Self::Context>,
    ) -> Result<HttpResponseOk<HealthResponse>, HttpError> {
        let status = rqctx.context().check_health().await;
        Ok(HttpResponseOk(HealthResponse { status }))
    }

    /// Handle `/api/version`
    #[endpoint {
        method = GET,
        path = "/api/version",
    }]
    async fn version(
        rqctx: RequestContext<Self::Context>,
    ) -> Result<HttpResponseOk<VersionResponse>, HttpError> {
        let version = rqctx.context().get_version().await;
        Ok(HttpResponseOk(VersionResponse { version }))
    }

    /// Handle `/api/contributions`
    #[endpoint {
        method = GET,
        path = "/api/contributions",
    }]
    async fn contributions(
        rqctx: RequestContext<Self::Context>,
    ) -> Result<HttpResponseOk<ContributionsResponse>, HttpError> {
        let repos = rqctx.context().get_contributions(&rqctx.log).await;
        Ok(HttpResponseOk(ContributionsResponse { repos }))
    }

    /// Handle `/api/oauth/callback`
    #[endpoint {
        method = GET,
        path = "/api/oauth/callback",
    }]
    async fn oauth_callback(
        rqctx: RequestContext<Self::Context>,
        query: Query<CallbackParams>,
    ) -> Result<HttpResponseOk<OAuthTokenResponse>, HttpError> {
        Ok(HttpResponseOk(
            rqctx
                .context()
                .exchange_oauth_token(&query.into_inner().code, &rqctx.log)
                .await
                .map_err(|error| HttpError::for_bad_request(None, error))?,
        ))
    }

    /// Handle `/api/oauth/refresh`
    #[endpoint {
        method = GET,
        path = "/api/oauth/refresh",
    }]
    async fn oauth_refresh(
        rqctx: RequestContext<Self::Context>,
        query: Query<RefreshParams>,
    ) -> Result<HttpResponseOk<OAuthTokenResponse>, HttpError> {
        Ok(HttpResponseOk(
            rqctx
                .context()
                .refresh_oauth_token(
                    &query.into_inner().refresh_token,
                    &rqctx.log,
                )
                .await
                .map_err(|error| HttpError::for_bad_request(None, error))?,
        ))
    }
}
