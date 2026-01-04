//! repoyear-backend executable.

use anyhow::anyhow;
use repoyear_backend::{api, repos};
use std::collections::BTreeMap;
use std::fs;
use std::process::ExitCode;

mod logging;
mod params;
mod server;

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
            let scan_config = if let Some(path) = &serve_params.scan_config {
                Some(repos::Config::parse(&fs::read_to_string(path)?)?)
            } else {
                None
            };

            server::serve(
                &serve_params.bind,
                &serve_params.github_client_id,
                &serve_params.github_client_secret,
                scan_config,
                &log,
            )?;
        }
        Command::Scan(scan_params) => {
            let result = repos::Config::parse(&fs::read_to_string(
                &scan_params.config,
            )?)?
            .repo_iter()
            .filter_map(|result| {
                result
                    .map_err(anyhow::Error::from) // FIXME?
                    .and_then(|(name, repo)| {
                        Ok((name, repos::scan_repo(&repo)?))
                    })
                    .inspect_err(|error| {
                        params.warn(format!("Warning: {error}\n")).unwrap();
                    })
                    .ok()
            })
            .collect::<BTreeMap<_, _>>();
            println!("{}", serde_json::to_string(&result)?);
        }
        Command::ScanRepo(scan_repo_params) => {
            let mut result = BTreeMap::new();
            for path in &scan_repo_params.repositories {
                match repos::scan_repo_path(path) {
                    Ok(times) => {
                        result.insert(path, times);
                    }
                    Err(error) => params
                        .warn(format!("Error in {path:?}: {error}\n"))
                        .unwrap(),
                }
            }
            println!("{}", serde_json::to_string(&result)?);
        }
        Command::Openapi(openapi_params) => {
            generate_openapi(openapi_params)?;
        }
        Command::Version => {
            println!("{}", env!("GIT_VERSION"));
        }
    }
    Ok(ExitCode::SUCCESS)
}

/// Generate `OpenAPI` specification.
///
/// Uses the trait-based API stub to generate the spec without requiring
/// an implementation. This is much faster than compiling the full
/// implementation.
///
/// # Errors
///
/// Returns an error if the `OpenAPI` spec cannot be generated or written.
fn generate_openapi(params: &params::OpenapiParams) -> anyhow::Result<()> {
    let api =
        api::repo_year_api_mod::stub_api_description().map_err(|error| {
            anyhow!("Failed to create API description: {error}")
        })?;

    // Use version from Cargo.toml via CARGO_PKG_VERSION environment variable
    let version = semver::Version::parse(env!("CARGO_PKG_VERSION"))
        .expect("CARGO_PKG_VERSION should be valid semver");

    let spec = api.openapi("RepoYear API", version);

    let json_value = spec.json()?;
    let json_string = serde_json::to_string_pretty(&json_value)?;

    if let Some(output_path) = &params.output {
        std::fs::write(output_path, format!("{json_string}\n"))?;
    } else {
        println!("{json_string}");
    }

    Ok(())
}
