//! contributions-tracker executable.

use std::process::ExitCode;

use contributions_tracker::api;
mod logging;
mod params;

use params::{Command, Params, Parser};

/// Wrapper to handle errors.
///
/// See [`cli()`].
fn main() -> ExitCode {
    let params = Params::parse();
    cli(&params).unwrap_or_else(|error| {
        let error = format!("{error}\n");
        if error.to_lowercase().starts_with("error") {
            params.warn(error).unwrap();
        } else {
            params.warn(format!("Error: {error}")).unwrap();
        }

        ExitCode::FAILURE
    })
}

/// Do the actual work.
///
/// Returns the exit code to use.
///
/// # Errors
///
/// This returns any errors encountered during the run so that they can be
/// outputted nicely in [`main()`].
fn cli(params: &Params) -> anyhow::Result<ExitCode> {
    let log = logging::init(params.verbose)?;

    match &params.command {
        Command::Serve(serve_params) => {
            api::serve(
                &serve_params.bind,
                &serve_params.github_client_id,
                &serve_params.github_client_secret,
                &log,
            )?;
            Ok(ExitCode::SUCCESS)
        }
        Command::Openapi(openapi_params) => {
            generate_openapi(openapi_params)?;
            Ok(ExitCode::SUCCESS)
        }
    }
}

/// Generate `OpenAPI` specification.
///
/// Uses the trait-based API stub to generate the spec without requiring
/// an implementation. This is much faster than compiling the full implementation.
///
/// # Errors
///
/// Returns an error if the `OpenAPI` spec cannot be generated or written.
fn generate_openapi(params: &params::OpenapiParams) -> anyhow::Result<()> {
    let api =
        api::contributions_api_mod::stub_api_description().map_err(|e| {
            anyhow::anyhow!("Failed to create API description: {e}")
        })?;

    // Use version from Cargo.toml via CARGO_PKG_VERSION environment variable
    let version = semver::Version::parse(env!("CARGO_PKG_VERSION"))
        .expect("CARGO_PKG_VERSION should be valid semver");

    let spec = api.openapi("Contributions Tracker API", version);

    let json_value = spec.json()?;
    let json_string = serde_json::to_string_pretty(&json_value)?;

    if let Some(output_path) = &params.output {
        std::fs::write(output_path, json_string)?;
    } else {
        println!("{json_string}");
    }

    Ok(())
}
