use std::time::Duration;

use anyhow::Result;
use crossterm::event::{Event, EventStream, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use futures_util::StreamExt;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use tokio::sync::mpsc;

use crate::model::{ServerEvent, WsStatus};
use crate::net::spawn_ws_client;
use crate::ui::{draw, UiState};

pub struct App {
    state: UiState,
    ws_rx: mpsc::UnboundedReceiver<ServerEvent>,
}

impl App {
    pub fn new(session_id: String, ws_url: String) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        spawn_ws_client(ws_url, tx);
        Self {
            state: UiState::new(session_id),
            ws_rx: rx,
        }
    }

    pub async fn run(mut self) -> Result<()> {
        enable_raw_mode()?;
        let mut stdout = std::io::stdout();
        execute!(stdout, EnterAlternateScreen)?;
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        let result = self.event_loop(&mut terminal).await;

        disable_raw_mode()?;
        execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
        terminal.show_cursor()?;
        result
    }

    async fn event_loop(
        &mut self,
        terminal: &mut Terminal<CrosstermBackend<std::io::Stdout>>,
    ) -> Result<()> {
        let mut events = EventStream::new();
        let mut tick = tokio::time::interval(Duration::from_millis(80));

        loop {
            terminal.draw(|f| draw(f, &self.state))?;

            tokio::select! {
                _ = tick.tick() => {}
                maybe_ev = events.next() => {
                    match maybe_ev {
                        Some(Ok(Event::Key(key))) if key.kind == KeyEventKind::Press => {
                            match key.code {
                                KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
                                KeyCode::Tab => self.state.focus_next(),
                                KeyCode::BackTab => self.state.focus_prev(),
                                KeyCode::Char('j') | KeyCode::Down => self.state.scroll_focused(1),
                                KeyCode::Char('k') | KeyCode::Up => self.state.scroll_focused(-1),
                                KeyCode::PageDown => {
                                    let step = if key.modifiers.contains(KeyModifiers::SHIFT) {
                                        1
                                    } else {
                                        5
                                    };
                                    self.state.page_scroll = self.state.page_scroll.saturating_add(step);
                                }
                                KeyCode::PageUp => {
                                    let step = if key.modifiers.contains(KeyModifiers::SHIFT) {
                                        1
                                    } else {
                                        5
                                    };
                                    self.state.page_scroll = self.state.page_scroll.saturating_sub(step);
                                }
                                KeyCode::Char('[') => self.state.focus_prev(),
                                KeyCode::Char(']') => self.state.focus_next(),
                                _ => {}
                            }
                        }
                        Some(Ok(Event::Resize(_, _))) => {
                            // Next draw uses new frame.area(); heights recompute from width.
                        }
                        Some(Err(e)) => {
                            self.state.status = WsStatus::Error(e.to_string());
                        }
                        None => return Ok(()),
                        _ => {}
                    }
                }
                maybe_msg = self.ws_rx.recv() => {
                    match maybe_msg {
                        Some(ServerEvent::RenderManifest(m)) => {
                            self.state.set_manifest(m);
                            self.state.status = WsStatus::Live;
                        }
                        Some(ServerEvent::Status(s)) => {
                            self.state.status = s;
                        }
                        None => {
                            self.state.status = WsStatus::Error("ws channel closed".into());
                        }
                    }
                }
            }
        }
    }
}
