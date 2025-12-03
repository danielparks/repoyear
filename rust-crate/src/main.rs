//! contributions-tracker executable.

use actix_cors::Cors;
use actix_web::{
    self, App, HttpResponse, HttpServer, Responder, get, http::header, mime,
};
use std::process::ExitCode;
use tracing_actix_web::TracingLogger;

mod logging;
mod params;

use params::{Params, Parser};

/// Wrapper to handle errors.
///
/// See [`cli()`].
fn main() -> ExitCode {
    let params = Params::parse();
    cli(&params).unwrap_or_else(|error| {
        tracing::debug!("Exiting with error: {error:#?}");
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
    logging::init(params.verbose)?;

    serve(&params.bind)?;

    Ok(ExitCode::SUCCESS)
}

/// Main entry point for serving over HTTP
///
/// # Errors
///
/// May return an error if the server could not start correctly.
#[actix_web::main]
pub async fn serve<S: AsRef<str>>(address: S) -> anyhow::Result<()> {
    let address = address.as_ref();

    // FIXME data: $GITHUB_CLIENT_ID, $GITHUB_CLIENT_SECRET

    HttpServer::new(|| {
        let cors = Cors::default()
            //.allowed_origin("...")
            .allow_any_origin()
            .allowed_methods(vec!["GET", "POST"])
            .allowed_headers(vec![header::CONTENT_TYPE, header::ACCEPT])
            .max_age(3600);
        App::new()
            .wrap(TracingLogger::default())
            .wrap(cors)
            .service(api_oauth_callback)
            .service(api_health)
    })
    .bind(address)?
    .run()
    .await?;
    Ok(()) // Pressing ^C causes run() to return.
}

#[get("/api/oauth/callback")]
async fn api_oauth_callback() -> impl Responder {
    HttpResponse::Ok()
        .append_header(header::ContentType(mime::APPLICATION_JSON))
        .body(r#"{"status":"ok"}"#)
}

#[get("/api/health")]
async fn api_health() -> impl Responder {
    HttpResponse::Ok()
        .append_header(header::ContentType(mime::APPLICATION_JSON))
        .body(r#"{"status":"ok"}"#)
}
