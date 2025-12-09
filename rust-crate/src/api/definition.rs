//! API contract definitions.
//!
//! This module contains the trait definitions and type signatures that define
//! the API surface. These are independent of any particular implementation.

use dropshot::{HttpError, HttpResponseOk, Query, RequestContext};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::future::Future;

/// Response from `/api/health`
#[derive(Debug, Serialize, JsonSchema)]
pub struct HealthResponse {
    /// Health status (always `"ok"`).
    pub status: String,
}

/// Parameters for `/api/oauth/callback`
#[derive(Debug, Deserialize, JsonSchema)]
pub struct CallbackParams {
    /// The code from GitHub.
    pub code: String,
}

/// Response from `/api/oauth/callback`
#[derive(Debug, Serialize, JsonSchema)]
pub struct CallbackSuccessResponse {
    /// The access token from GitHub.
    pub access_token: String,
}

/// Base trait defining the business logic for the API.
///
/// This trait contains the actual implementation methods that handle
/// the business logic for each endpoint. Implement this trait to provide
/// custom behavior (e.g., for testing with mocks).
pub trait ApiBase: Send + Sync {
    /// Check the health status of the service.
    fn check_health(&self) -> impl Future<Output = String> + Send;

    /// Exchange a GitHub OAuth code for an access token.
    ///
    /// # Errors
    ///
    /// Returns an error message if the OAuth exchange fails.
    fn exchange_oauth_token(
        &self,
        code: String,
        log: &slog::Logger,
    ) -> impl Future<Output = Result<String, String>> + Send;
}

/// API trait with endpoint definitions.
///
/// This trait defines the HTTP API surface using Dropshot's endpoint
/// attributes. The default implementations delegate to the `ApiBase` trait,
/// allowing for multiple implementations (production, test, mock, etc.).
#[dropshot::api_description]
pub trait ContributionsApi {
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

    /// Handle `/api/oauth/callback`
    #[endpoint {
        method = GET,
        path = "/api/oauth/callback",
    }]
    async fn oauth_callback(
        rqctx: RequestContext<Self::Context>,
        query: Query<CallbackParams>,
    ) -> Result<HttpResponseOk<CallbackSuccessResponse>, HttpError> {
        let params = query.into_inner();
        let log = &rqctx.log;

        let access_token = rqctx
            .context()
            .exchange_oauth_token(params.code, log)
            .await
            .map_err(|e| HttpError::for_bad_request(None, e))?;

        Ok(HttpResponseOk(CallbackSuccessResponse { access_token }))
    }
}
