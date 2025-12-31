//! Server startup and configuration.

use anyhow::anyhow;
use dropshot::{ConfigDropshot, HttpServerStarter};
use repoyear_backend::api::{AppState, RepoYearApiImpl, repo_year_api_mod};

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
pub async fn serve(
    address: &str,
    github_client_id: &str,
    github_client_secret: &str,
    log: &slog::Logger,
) -> anyhow::Result<()> {
    let config_dropshot = ConfigDropshot {
        bind_address: address
            .parse()
            .map_err(|error| anyhow!("Invalid bind address: {error}"))?,
        default_request_body_max_bytes: 1024,
        default_handler_task_mode: dropshot::HandlerTaskMode::Detached,
        log_headers: vec![],
    };

    let api = repo_year_api_mod::api_description::<RepoYearApiImpl>().map_err(
        |error| anyhow!("Failed to create API description: {error}"),
    )?;

    let state = AppState {
        github_client_id: github_client_id.to_owned(),
        github_client_secret: github_client_secret.to_owned(),
        http_client: reqwest::Client::new(),
    };

    let server = HttpServerStarter::new(&config_dropshot, api, state, log)
        .map_err(|error| anyhow!("Failed to create server: {error}"))?
        .start();

    let version = env!("GIT_VERSION");
    slog::info!(log, "Server {version} running on http://{address}");

    server
        .await
        .map_err(|error| anyhow!("Server error: {error}"))
}
