//! Mock implementation of the API for testing.

use super::definition::{ApiBase, OAuthTokenResponse, RepoYearApi};

/// Mock state for testing that returns predefined responses.
#[derive(Clone, Debug)]
pub struct MockAppState {
    /// The health status to return.
    pub health_status: String,
    /// The access token to return from OAuth.
    pub mock_access_token: Option<String>,
    /// The refresh token to return from OAuth.
    pub mock_refresh_token: Option<String>,
    /// Error message to return from OAuth (if Some).
    pub mock_oauth_error: Option<String>,
}

impl MockAppState {
    /// Create a new mock state with successful defaults.
    #[must_use]
    pub fn new() -> Self {
        Self {
            health_status: "ok".to_owned(),
            mock_access_token: Some("mock_token_12345".to_owned()),
            mock_refresh_token: Some("mock_refresh_12345".to_owned()),
            mock_oauth_error: None,
        }
    }

    /// Create a mock state that simulates OAuth failure.
    #[must_use]
    pub fn with_oauth_error(error: String) -> Self {
        Self {
            health_status: "ok".to_owned(),
            mock_access_token: None,
            mock_refresh_token: None,
            mock_oauth_error: Some(error),
        }
    }
}

impl Default for MockAppState {
    fn default() -> Self {
        Self::new()
    }
}

impl ApiBase for MockAppState {
    async fn check_health(&self) -> String {
        self.health_status.clone()
    }

    async fn get_version(&self) -> String {
        env!("GIT_VERSION").to_owned()
    }

    async fn exchange_oauth_token(
        &self,
        _code: &str,
        _log: &slog::Logger,
    ) -> Result<OAuthTokenResponse, String> {
        if let Some(error) = &self.mock_oauth_error {
            Err(error.clone())
        } else {
            let access_token = self
                .mock_access_token
                .clone()
                .ok_or_else(|| "No token configured".to_owned())?;

            Ok(OAuthTokenResponse {
                access_token,
                refresh_token: self.mock_refresh_token.clone(),
                expires_in: Some(28_800),
                refresh_token_expires_in: Some(15_897_600),
            })
        }
    }

    async fn refresh_oauth_token(
        &self,
        _refresh_token: &str,
        _log: &slog::Logger,
    ) -> Result<OAuthTokenResponse, String> {
        if let Some(error) = &self.mock_oauth_error {
            Err(error.clone())
        } else {
            let access_token = self
                .mock_access_token
                .clone()
                .ok_or_else(|| "No token configured".to_owned())?;
            let refresh_token = self
                .mock_refresh_token
                .clone()
                .ok_or_else(|| "No refresh token configured".to_owned())?;

            Ok(OAuthTokenResponse {
                access_token,
                refresh_token: Some(refresh_token),
                expires_in: Some(28_800),
                refresh_token_expires_in: Some(15_897_600),
            })
        }
    }
}

/// Mock implementation type for the `RepoYearApi` trait.
pub enum MockApiImpl {}

impl RepoYearApi for MockApiImpl {
    type Context = MockAppState;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_health() {
        let mock_state = MockAppState::new();
        let result = mock_state.check_health().await;
        assert_eq!(result, "ok");
    }

    #[tokio::test]
    async fn test_mock_oauth_success() {
        let mock_state = MockAppState::new();
        let log = slog::Logger::root(slog::Discard, slog::o!());
        let result = mock_state.exchange_oauth_token("test_code", &log).await;
        let response = result.unwrap();
        assert_eq!(response.access_token, "mock_token_12345");
        assert_eq!(
            response.refresh_token,
            Some("mock_refresh_12345".to_owned())
        );
    }

    #[tokio::test]
    async fn test_mock_oauth_failure() {
        let mock_state =
            MockAppState::with_oauth_error("Invalid code".to_owned());
        let log = slog::Logger::root(slog::Discard, slog::o!());
        let result = mock_state.exchange_oauth_token("test_code", &log).await;
        assert_eq!(result.unwrap_err(), "Invalid code");
    }
}
