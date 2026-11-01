//! Closed Git contracts shared by desktop IPC and the server.
mod requests;
mod results;
pub use requests::*;
pub use results::*;
#[cfg(test)]
mod tests;
