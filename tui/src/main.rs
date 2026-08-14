mod action;
mod app;
mod content_measure;
mod layout_chunks;
mod model;
mod nav;
mod net;
mod ui;
mod widgets_render;

use std::env;

use anyhow::Result;

use crate::app::App;

fn default_ws_url(session: &str) -> String {
    format!("ws://127.0.0.1:3001/api/v1/tui/stream?sessionId={session}")
}

#[tokio::main]
async fn main() -> Result<()> {
    let session = env::var("TUI_SESSION_ID").unwrap_or_else(|_| "demo".into());
    let ws_url = env::var("TUI_WS_URL").unwrap_or_else(|_| default_ws_url(&session));

    let app = App::new(session, ws_url);
    app.run().await
}
