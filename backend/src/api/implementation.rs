//! Production implementation of the API.
//!
//! This module contains the concrete implementation of the API traits,
//! including the GitHub OAuth integration.

use super::definition::{ApiBase, OAuthTokenResponse, RepoYearApi};
use crate::repos;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// State data for the API (GitHub credentials and HTTP client).
#[derive(Clone)]
pub struct AppState {
    /// The GitHub client ID for OAuth.
    pub github_client_id: String,
    /// The GitHub client secret for OAuth.
    pub github_client_secret: String,
    /// HTTP client for making requests to GitHub.
    pub http_client: reqwest::Client,
    /// Configuration for repository scanning.
    pub scan_config: Option<repos::Config>,
}

/// A request to <https://github.com/login/oauth/access_token>
#[derive(Debug, Serialize)]
struct GitHubTokenRequest<'a> {
    /// The GitHub client ID for OAuth.
    client_id: &'a str,
    /// The GitHub client secret for OAuth.
    client_secret: &'a str,
    /// The code from GitHub.
    code: &'a str,
}

/// A refresh token request to <https://github.com/login/oauth/access_token>
#[derive(Debug, Serialize)]
struct GitHubRefreshRequest<'a> {
    /// The GitHub client ID for OAuth.
    client_id: &'a str,
    /// The GitHub client secret for OAuth.
    client_secret: &'a str,
    /// The grant type (always "refresh_token" for refresh requests).
    grant_type: &'a str,
    /// The refresh token from GitHub.
    refresh_token: &'a str,
}

/// A response from <https://github.com/login/oauth/access_token>
#[derive(Debug, Deserialize)]
struct GitHubTokenResponse {
    /// The access token if the request was successful.
    access_token: Option<String>,
    /// The refresh token (for GitHub Apps with token expiration).
    refresh_token: Option<String>,
    /// Number of seconds until the access token expires.
    expires_in: Option<u64>,
    /// Number of seconds until the refresh token expires.
    refresh_token_expires_in: Option<u64>,
    /// The error code if the request failed.
    error: Option<String>,
    /// The error message if the request failed.
    error_description: Option<String>,
}

impl AppState {
    /// Helper function to make OAuth token requests to GitHub.
    ///
    /// This function handles the common logic for both initial token exchange
    /// and token refresh requests.
    async fn request_github_token<T: Serialize + Sync>(
        &self,
        request_body: &T,
        log: &slog::Logger,
        error_context: &str,
    ) -> Result<OAuthTokenResponse, String> {
        let token_data = self
            .http_client
            .post("https://github.com/login/oauth/access_token")
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(reqwest::header::ACCEPT, "application/json")
            .json(request_body)
            .send()
            .await
            .map_err(|error| {
                slog::error!(log, "{error_context} request failed: {error}");
                "Service temporarily unavailable".to_owned()
            })?
            .json::<GitHubTokenResponse>()
            .await
            .map_err(|error| {
                slog::error!(
                    log,
                    "Failed to parse {error_context} response: {error}"
                );
                "Internal server error".to_owned()
            })?;

        if let Some(error) = &token_data.error {
            slog::error!(log, "Error in {error_context} response: {error}");
            let message = token_data
                .error_description
                .clone()
                .unwrap_or_else(|| format!("{error_context} failed"));
            return Err(message);
        }

        Ok(OAuthTokenResponse {
            access_token: token_data
                .access_token
                .ok_or_else(|| "Internal server error".to_owned())?,
            refresh_token: token_data.refresh_token,
            expires_in: token_data.expires_in,
            refresh_token_expires_in: token_data.refresh_token_expires_in,
        })
    }
}

impl ApiBase for AppState {
    async fn check_health(&self) -> String {
        "ok".to_owned()
    }

    async fn get_version(&self) -> String {
        env!("GIT_VERSION").to_owned()
    }

    async fn get_contributions(
        &self,
        log: &slog::Logger,
    ) -> HashMap<String, Vec<i64>> {
        let Some(config) = &self.scan_config else {
            return HashMap::new();
        };

        config
            .repo_iter()
            .filter_map(|result| {
                result
                    .map_err(anyhow::Error::from) // FIXME?
                    .and_then(|(name, repo)| {
                        Ok((name, repos::scan_repo(&repo)?))
                    })
                    .inspect_err(|error| {
                        slog::warn!(log, "{error}");
                    })
                    .ok()
            })
            .collect()
    }

    async fn exchange_oauth_token(
        &self,
        code: &str,
        log: &slog::Logger,
    ) -> Result<OAuthTokenResponse, String> {
        self.request_github_token(
            &GitHubTokenRequest {
                client_id: &self.github_client_id,
                client_secret: &self.github_client_secret,
                code,
            },
            log,
            "OAuth",
        )
        .await
    }

    async fn refresh_oauth_token(
        &self,
        refresh_token: &str,
        log: &slog::Logger,
    ) -> Result<OAuthTokenResponse, String> {
        self.request_github_token(
            &GitHubRefreshRequest {
                client_id: &self.github_client_id,
                client_secret: &self.github_client_secret,
                grant_type: "refresh_token",
                refresh_token,
            },
            log,
            "OAuth refresh",
        )
        .await
    }
}

/// Implementation type for the `RepoYearApi` trait.
///
/// This is an empty enum that serves as the implementation marker.
/// All the actual logic is in the default trait methods.
pub enum RepoYearApiImpl {}

impl RepoYearApi for RepoYearApiImpl {
    type Context = AppState;
}
