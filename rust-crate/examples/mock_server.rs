//! Example showing how to use the mock API implementation.
//!
//! This demonstrates one of the key benefits of the trait-based API approach:
//! you can easily create alternative implementations for testing without
//! duplicating endpoint definitions.
//!
//! Run with: `cargo run --example mock_server`

use contributions_tracker::api::{
    contributions_api_mod,
    mock::{MockApiImpl, MockAppState},
};
use slog::Drain;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Create a mock API description using the mock implementation
    let api = contributions_api_mod::api_description::<MockApiImpl>().map_err(
        |e| anyhow::anyhow!("Failed to create API description: {e}"),
    )?;

    // Create mock state with predefined responses
    let mock_state = MockAppState::new();

    // Configure the server
    let config_dropshot = dropshot::ConfigDropshot {
        bind_address: "127.0.0.1:3001".parse()?,
        default_request_body_max_bytes: 1024,
        default_handler_task_mode: dropshot::HandlerTaskMode::Detached,
        log_headers: vec![],
    };

    // Create a logger
    let decorator = slog_term::TermDecorator::new().build();
    let drain = slog_term::FullFormat::new(decorator).build().fuse();
    let drain = slog_async::Async::new(drain).build().fuse();
    let log = slog::Logger::root(drain, slog::o!());

    // Start the server with the mock implementation
    let server = dropshot::HttpServerStarter::new(
        &config_dropshot,
        api,
        mock_state,
        &log,
    )
    .map_err(|e| anyhow::anyhow!("Failed to create server: {e}"))?
    .start();

    slog::info!(log, "Mock server running on http://127.0.0.1:3001");
    slog::info!(log, "Try: curl http://127.0.0.1:3001/api/health");
    slog::info!(
        log,
        "Try: curl 'http://127.0.0.1:3001/api/oauth/callback?code=test'"
    );

    server
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))?;

    Ok(())
}
