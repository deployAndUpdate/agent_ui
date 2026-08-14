use std::time::Duration;

use anyhow::Context;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::model::{ServerEvent, TuiManifest, WsStatus};

pub fn spawn_ws_client(url: String, tx: mpsc::UnboundedSender<ServerEvent>) {
    tokio::spawn(async move {
        let mut backoff_ms: u64 = 400;
        loop {
            let _ = tx.send(ServerEvent::Status(WsStatus::Connecting));
            match run_session(&url, &tx).await {
                Ok(()) => {
                    let _ = tx.send(ServerEvent::Status(WsStatus::Reconnecting));
                    backoff_ms = 400;
                }
                Err(err) => {
                    let _ = tx.send(ServerEvent::Status(WsStatus::Error(err.to_string())));
                }
            }
            tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
            backoff_ms = (backoff_ms.saturating_mul(2)).min(8_000);
            let _ = tx.send(ServerEvent::Status(WsStatus::Reconnecting));
        }
    });
}

async fn run_session(
    url: &str,
    tx: &mpsc::UnboundedSender<ServerEvent>,
) -> anyhow::Result<()> {
    let (ws, _) = connect_async(url)
        .await
        .with_context(|| format!("connect {url}"))?;
    let (mut write, mut read) = ws.split();
    let _ = tx.send(ServerEvent::Status(WsStatus::Live));

    while let Some(msg) = read.next().await {
        let msg = msg.context("ws read")?;
        match msg {
            Message::Text(text) => {
                if let Some(ev) = parse_server_text(&text) {
                    let _ = tx.send(ev);
                }
            }
            Message::Ping(p) => {
                write.send(Message::Pong(p)).await.ok();
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    Ok(())
}

fn parse_server_text(text: &str) -> Option<ServerEvent> {
    let v: Value = serde_json::from_str(text).ok()?;
    let event = v.get("event")?.as_str()?;
    if event != "RENDER_MANIFEST" {
        return None;
    }
    let payload = v.get("payload")?.clone();
    let manifest: TuiManifest = serde_json::from_value(payload).ok()?;
    Some(ServerEvent::RenderManifest(manifest))
}
