//! Backend server to help with GitHub OAuth.
//!
//! This module is organized into:
//! - [`definition`] - API contract (traits and types)
//! - [`implementation`] - Production implementation
//! - [`mock`] - Mock implementation for testing

pub mod definition;
pub mod implementation;
pub mod mock;

// Re-export commonly used items from definition
pub use definition::{
    ApiBase, CallbackParams, CallbackSuccessResponse, ContributionsApi,
    HealthResponse,
};

// Re-export the generated module containing API description functions
pub use definition::contributions_api_mod;

// Re-export commonly used items from implementation
pub use implementation::{AppState, ContributionsApiImpl};
