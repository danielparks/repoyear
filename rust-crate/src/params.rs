//! Code to deal with executable parameters.
#![allow(clippy::allow_attributes, reason = "framework code from a template")]

use axum::http::HeaderValue;
use std::io::{self, IsTerminal, Write};
use termcolor::{Color, ColorSpec, StandardStream, WriteColor};
use tower_http::cors::AllowOrigin;

pub use clap::Parser;

/// Parameters to configure executable.
#[derive(Debug, clap::Parser)]
#[clap(version, about)]
pub struct Params {
    /// Whether or not to output in color
    #[clap(long, default_value = "auto", value_name = "WHEN")]
    pub color: ColorChoice,

    /// Verbosity (may be repeated up to three times)
    #[clap(short, long, action = clap::ArgAction::Count)]
    pub verbose: u8,

    /// Address to bind to
    #[arg(long, default_value = "localhost:3000")]
    pub bind: String,

    /// GitHub client ID for OAuth
    #[arg(long, env)]
    pub github_client_id: String,

    /// GitHub client secret for OAuth
    #[arg(long, env, hide_env_values = true)]
    pub github_client_secret: String,

    /// Origins to allow for cross-site requests ("none" disables CORS)
    #[arg(long, value_parser = parse_allow_origin, default_value = "none")]
    pub allow_origin: OptionalAllowOrigin,
}

impl Params {
    /// Print a warning message in error color to `err_stream()`.
    pub fn warn<S: AsRef<str>>(&self, message: S) -> io::Result<()> {
        let mut err_out = self.err_stream();
        err_out.set_color(&error_color())?;
        err_out.write_all(message.as_ref().as_bytes())?;
        err_out.reset()?;

        Ok(())
    }

    /// Get stream to use for standard output.
    #[allow(dead_code, reason = "framework code")]
    pub fn out_stream(&self) -> StandardStream {
        StandardStream::stdout(self.color_choice(&io::stdout()))
    }

    /// Get stream to use for errors.
    pub fn err_stream(&self) -> StandardStream {
        StandardStream::stderr(self.color_choice(&io::stderr()))
    }

    /// Whether or not to output on a stream in color.
    ///
    /// Checks if passed stream is a terminal.
    pub fn color_choice<T: IsTerminal>(
        &self,
        stream: &T,
    ) -> termcolor::ColorChoice {
        if self.color == ColorChoice::Auto && !stream.is_terminal() {
            termcolor::ColorChoice::Never
        } else {
            self.color.into()
        }
    }
}

/// Whether or not to output in color
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, clap::ValueEnum)]
pub enum ColorChoice {
    /// Output in color when running in a terminal that supports it
    #[default]
    Auto,

    /// Always output in color
    Always,

    /// Never output in color
    Never,
}

impl From<ColorChoice> for termcolor::ColorChoice {
    fn from(choice: ColorChoice) -> Self {
        match choice {
            ColorChoice::Auto => Self::Auto,
            ColorChoice::Always => Self::Always,
            ColorChoice::Never => Self::Never,
        }
    }
}

/// Returns color used to output errors.
pub fn error_color() -> ColorSpec {
    let mut color = ColorSpec::new();
    color.set_fg(Some(Color::Red));
    color.set_intense(true);
    color
}

/// Stand in for `Option<AllowOrigin>`.
///
/// Necessary because Clap’s `value_parser` can’t return `Option<AllowOrigin>`.
#[derive(Clone, Debug)]
pub enum OptionalAllowOrigin {
    /// CORS is disabled.
    None,

    /// CORS is enabled with the specified origins.
    Some(AllowOrigin),
}

impl From<OptionalAllowOrigin> for Option<AllowOrigin> {
    fn from(opt: OptionalAllowOrigin) -> Self {
        match opt {
            OptionalAllowOrigin::None => None,
            OptionalAllowOrigin::Some(origins) => Some(origins),
        }
    }
}

/// Parse a string into an `OptionalAllowOrigin` for CORS configuration.
///
/// Accepts:
///   - "none" to disable CORS
///   - "*" for any origin
///   - At least one origin, separated by commas, e.g. `"http://localhost:5173"`
///     or `"http://localhost:5173,http://example.com"`
fn parse_allow_origin(s: &str) -> Result<OptionalAllowOrigin, String> {
    let s = s.trim();

    if s == "*" {
        return Ok(OptionalAllowOrigin::Some(AllowOrigin::any()));
    } else if s == "none" {
        return Ok(OptionalAllowOrigin::None);
    }

    let header_values: Vec<HeaderValue> = s
        .split(',')
        .map(str::trim)
        .map(|origin| {
            // FIXME validate that the origin is a URL?
            if origin.is_empty() {
                Err("Origin cannot be empty string".to_owned())
            } else if origin == "*" {
                Err("Cannot use wildcard origin with other origins".to_owned())
            } else if origin == "none" {
                Err("Cannot use 'none' with other origins".to_owned())
            } else {
                HeaderValue::from_str(origin)
                    .map_err(|e| format!("Invalid origin '{origin}': {e}"))
            }
        })
        .collect::<Result<Vec<_>, _>>()?;

    if header_values.is_empty() {
        Err("Origin cannot be empty string".to_owned())
    } else if header_values.len() == 1 {
        Ok(OptionalAllowOrigin::Some(AllowOrigin::exact(
            header_values.into_iter().next().unwrap(),
        )))
    } else {
        Ok(OptionalAllowOrigin::Some(AllowOrigin::list(header_values)))
    }
}
