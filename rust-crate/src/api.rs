//! Backend server to help with GitHub OAuth.

use axum::{
    Router,
    extract::{Query, State},
    http::{Method, StatusCode, header},
    response::Json,
    routing::get,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};

/// Start web server for API.
#[tokio::main]
pub async fn serve<S, A>(
    address: &str,
    github_client_id: S,
    github_client_secret: S,
    allow_origin: A,
) -> anyhow::Result<()>
where
    S: Into<String>,
    A: Into<AllowOrigin>,
{
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Server running on http://{address}");

    let app = Router::new()
        .route("/api/oauth/callback", get(oauth_callback))
        .route("/api/health", get(health_check))
        .fallback(api_not_found)
        .layer(
            CorsLayer::new()
                .allow_origin(allow_origin)
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers([header::CONTENT_TYPE]),
        )
        .with_state(Arc::new(AppState {
            github_client_id: github_client_id.into(),
            github_client_secret: github_client_secret.into(),
        }));

    axum::serve(listener, app).await?;
    Ok(())
}

/// State data for the API (just the GitHub credentials).
#[derive(Clone, Debug)]
struct AppState {
    /// The GitHub client ID for OAuth.
    github_client_id: String,
    /// The GitHub client secret for OAuth.
    github_client_secret: String,
}

/// Response from /api/health
#[derive(Debug, Serialize)]
struct HealthResponse {
    /// Health status (always `"ok"`).
    status: String,
}

/// Handle /api/health
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok".to_owned() })
}

/// An error response from our API
#[derive(Debug, Serialize)]
struct ErrorResponse {
    /// The error message.
    error: String,
}

/// A `404 Not found` response from our API
async fn api_not_found() -> (StatusCode, Json<ErrorResponse>) {
    api_error(StatusCode::NOT_FOUND, "Not found")
}

/// Generate an error response from our API
fn api_error<S: Into<String>>(
    status: StatusCode,
    message: S,
) -> (StatusCode, Json<ErrorResponse>) {
    (status, Json(ErrorResponse { error: message.into() }))
}

/// Parameters for /api/oauth/callback
#[derive(Debug, Deserialize)]
struct CallbackParams {
    /// The code from GitHub.
    code: Option<String>,
}

/// Response from /api/oauth/callback
#[derive(Debug, Serialize)]
struct CallbackSuccessResponse {
    /// The access token from GitHub.
    access_token: String,
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

/// Handle /api/oauth/callback
async fn oauth_callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CallbackParams>,
) -> Result<Json<CallbackSuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let code = params.code.ok_or_else(|| {
        api_error(StatusCode::BAD_REQUEST, "No code provided")
    })?;

    let token_data = reqwest::Client::new()
        .post("https://github.com/login/oauth/access_token")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&GitHubTokenRequest {
            client_id: &state.github_client_id,
            client_secret: &state.github_client_secret,
            code,
        })
        .send()
        .await
        .map_err(|e| {
            eprintln!("OAuth error: {e}");
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error",
            )
        })?
        .json::<GitHubTokenResponse>()
        .await
        .map_err(|e| {
            eprintln!("Failed to parse token response: {e}");
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error",
            )
        })?;

    if let Some(error) = token_data.error {
        eprintln!("Error in token response: {error}");
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            token_data
                .error_description
                .unwrap_or_else(|| "Authentication failed".to_owned()),
        ));
    }

    let access_token = token_data.access_token.ok_or_else(|| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "No access token in response",
        )
    })?;
    Ok(Json(CallbackSuccessResponse { access_token }))
}
