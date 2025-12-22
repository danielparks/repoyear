//! Production implementation of the API.
//!
//! This module contains the concrete implementation of the API traits,
//! including the GitHub OAuth integration.

use super::definition::{ApiBase, ContributionsApi};
use serde::{Deserialize, Serialize};

/// State data for the API (GitHub credentials and HTTP client).
#[derive(Clone, Debug)]
pub struct AppState {
    /// The GitHub client ID for OAuth.
    pub github_client_id: String,
    /// The GitHub client secret for OAuth.
    pub github_client_secret: String,
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

    async fn get_version(&self) -> String {
        env!("GIT_VERSION").to_owned()
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
            .map_err(|error| {
                slog::error!(log, "OAuth request failed: {error}");
                "Service temporarily unavailable".to_owned()
            })?
            .json::<GitHubTokenResponse>()
            .await
            .map_err(|error| {
                slog::error!(log, "Failed to parse token response: {error}");
                "Internal server error".to_owned()
            })?;

        if let Some(error) = token_data.error {
            slog::error!(log, "Error in token response: {error}");
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
