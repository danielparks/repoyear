//! Backend server to help with GitHub OAuth.

pub mod mock;

use dropshot::{
    ConfigDropshot, HttpError, HttpResponseOk, HttpServerStarter, Query,
    RequestContext,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::future::Future;

/// Response from /api/health
#[derive(Debug, Serialize, JsonSchema)]
pub struct HealthResponse {
    /// Health status (always `"ok"`).
    pub status: String,
}

/// Parameters for /api/oauth/callback
#[derive(Debug, Deserialize, JsonSchema)]
pub struct CallbackParams {
    /// The code from GitHub.
    pub code: String,
}

/// Response from /api/oauth/callback
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

    /// Handle /api/health
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

    /// Handle /api/oauth/callback
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

/// State data for the API (GitHub credentials and HTTP client).
#[derive(Clone, Debug)]
pub struct AppState {
    /// The GitHub client ID for OAuth.
    github_client_id: String,
    /// The GitHub client secret for OAuth.
    github_client_secret: String,
}

impl AppState {
    /// Create a new `AppState` with the given credentials.
    #[must_use] 
    pub const fn new(github_client_id: String, github_client_secret: String) -> Self {
        Self { github_client_id, github_client_secret }
    }
}

/// A request to <https://github.com/login/oauth/access_token>
#[derive(Debug, Serialize)]
struct GitHubTokenRequest<'a> {
    /// The GitHub client ID for OAuth.
    client_id: &'a str,
    /// The GitHub client secret for OAuth.
    client_secret: &'a str,
    /// The code from GitHub.
    code: String,
}

/// A response from <https://github.com/login/oauth/access_token>
#[derive(Debug, Deserialize)]
struct GitHubTokenResponse {
    /// The access token if the request was successful.
    access_token: Option<String>,
    /// The error code if the request failed.
    error: Option<String>,
    /// The error message if the request failed.
    error_description: Option<String>,
}

impl ApiBase for AppState {
    async fn check_health(&self) -> String {
        "ok".to_owned()
    }

    async fn exchange_oauth_token(
        &self,
        code: String,
        log: &slog::Logger,
    ) -> Result<String, String> {
        let token_data = reqwest::Client::new()
            .post("https://github.com/login/oauth/access_token")
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(reqwest::header::ACCEPT, "application/json")
            .json(&GitHubTokenRequest {
                client_id: &self.github_client_id,
                client_secret: &self.github_client_secret,
                code,
            })
            .send()
            .await
            .map_err(|e| {
                slog::error!(log, "OAuth request failed: {}", e);
                "Service temporarily unavailable".to_owned()
            })?
            .json::<GitHubTokenResponse>()
            .await
            .map_err(|e| {
                slog::error!(log, "Failed to parse token response: {}", e);
                "Internal server error".to_owned()
            })?;

        if let Some(error) = token_data.error {
            slog::error!(log, "Error in token response: {}", error);
            let message = token_data
                .error_description
                .unwrap_or_else(|| "Authentication failed".to_owned());
            return Err(message);
        }

        token_data
            .access_token
            .ok_or_else(|| "Internal server error".to_owned())
    }
}

/// Implementation type for the `ContributionsApi` trait.
///
/// This is an empty enum that serves as the implementation marker.
/// All the actual logic is in the default trait methods.
pub enum ContributionsApiImpl {}

impl ContributionsApi for ContributionsApiImpl {
    type Context = AppState;
}

/// Start web server for API.
///
/// # Errors
///
/// Returns an error if:
/// - The bind address cannot be parsed
/// - The API description cannot be created
/// - The server cannot be created
/// - The server encounters an error during operation
///
/// # Panics
///
/// This function does not panic under normal operation.
#[tokio::main]
pub async fn serve<S>(
    address: &str,
    github_client_id: S,
    github_client_secret: S,
    log: &slog::Logger,
) -> anyhow::Result<()>
where
    S: Into<String>,
{
    let config_dropshot = ConfigDropshot {
        bind_address: address
            .parse()
            .map_err(|e| anyhow::anyhow!("Invalid bind address: {e}"))?,
        default_request_body_max_bytes: 1024,
        default_handler_task_mode: dropshot::HandlerTaskMode::Detached,
        log_headers: vec![],
    };

    let api = contributions_api_mod::api_description::<ContributionsApiImpl>()
        .map_err(|e| {
            anyhow::anyhow!("Failed to create API description: {e}")
        })?;

    let state =
        AppState::new(github_client_id.into(), github_client_secret.into());

    let server = HttpServerStarter::new(&config_dropshot, api, state, log)
        .map_err(|e| anyhow::anyhow!("Failed to create server: {e}"))?
        .start();

    slog::info!(log, "Server running on http://{address}");

    server
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))
}
