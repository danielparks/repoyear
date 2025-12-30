//! Errors encountered by repo scanner.

use std::result;

/// `Result` type for `Error`.
pub type Result<T, E = Error> = result::Result<T, E>;

/// Errors encountered by repo scanner.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// An error encountered parsing the TOML configuration.
    #[error(transparent)]
    Toml(#[from] toml::de::Error),
}
