//! Code to deal with executable parameters.
#![allow(clippy::allow_attributes, reason = "framework code from a template")]

use std::io::{self, IsTerminal, Write};
use termcolor::{Color, ColorSpec, StandardStream, WriteColor};

pub use clap::Parser;

/// GitHub contributions tracker
#[derive(Debug, clap::Parser)]
#[clap(version, about)]
pub struct Params {
    /// Whether or not to output in color
    #[clap(long, default_value = "auto", value_name = "WHEN", global = true)]
    pub color: ColorChoice,

    /// Verbosity (may be repeated up to three times)
    #[clap(short, long, action = clap::ArgAction::Count, global = true)]
    pub verbose: u8,

    /// The subcommand to execute
    #[command(subcommand)]
    pub command: Command,
}

/// Available subcommands
#[derive(Debug, clap::Subcommand)]
pub enum Command {
    /// Start the API server
    Serve(ServeParams),
    /// Generate `OpenAPI` specification
    Openapi(OpenapiParams),
}

/// Parameters for the `serve` subcommand
#[derive(Debug, clap::Args)]
pub struct ServeParams {
    /// Address to bind to
    #[arg(long, default_value = "127.0.0.1:3000")]
    pub bind: String,

    /// GitHub client ID for OAuth
    #[arg(long, env)]
    pub github_client_id: String,

    /// GitHub client secret for OAuth
    #[arg(long, env, hide_env_values = true)]
    pub github_client_secret: String,
}

/// Parameters for the `openapi` subcommand
#[derive(Debug, clap::Args)]
pub struct OpenapiParams {
    /// Output file (defaults to stdout)
    #[arg(short, long)]
    pub output: Option<String>,
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
