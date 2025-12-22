//! Mock implementation of the API for testing.

use super::definition::{ApiBase, ContributionsApi};

/// Mock state for testing that returns predefined responses.
#[derive(Clone, Debug)]
pub struct MockAppState {
    /// The health status to return.
    pub health_status: String,
    /// The access token to return from OAuth.
    pub mock_access_token: Option<String>,
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
            mock_oauth_error: None,
        }
    }

    /// Create a mock state that simulates OAuth failure.
    #[must_use]
    pub fn with_oauth_error(error: String) -> Self {
        Self {
            health_status: "ok".to_owned(),
            mock_access_token: None,
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
        _code: String,
        _log: &slog::Logger,
    ) -> Result<String, String> {
        if let Some(error) = &self.mock_oauth_error {
            Err(error.clone())
        } else {
            self.mock_access_token
                .clone()
                .ok_or_else(|| "No token configured".to_owned())
        }
    }
}

/// Mock implementation type for the `ContributionsApi` trait.
pub enum MockApiImpl {}

impl ContributionsApi for MockApiImpl {
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
        let result = mock_state
            .exchange_oauth_token("test_code".to_owned(), &log)
            .await;
        assert_eq!(result.unwrap(), "mock_token_12345");
    }

    #[tokio::test]
    async fn test_mock_oauth_failure() {
        let mock_state =
            MockAppState::with_oauth_error("Invalid code".to_owned());
        let log = slog::Logger::root(slog::Discard, slog::o!());
        let result = mock_state
            .exchange_oauth_token("test_code".to_owned(), &log)
            .await;
        assert_eq!(result.unwrap_err(), "Invalid code");
    }
}
