use std::time::Duration;

use anyhow::Result;
use crossterm::event::{Event, EventStream, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use futures_util::StreamExt;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::Terminal;
use tokio::sync::mpsc;

use crate::action::{DetailCtx, UserAction};
use crate::model::{ServerEvent, WsStatus};
use crate::nav::{table_row_cells, NavMode, PAGE_STEP};
use crate::net::spawn_ws_client;
use crate::ui::{draw, sync_viewport, UiState};

pub struct App {
    state: UiState,
    ws_rx: mpsc::UnboundedReceiver<ServerEvent>,
    action_tx: mpsc::UnboundedSender<UserAction>,
}

impl App {
    pub fn new(session_id: String, ws_url: String) -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let (action_tx, action_rx) = mpsc::unbounded_channel();
        spawn_ws_client(ws_url, event_tx, action_rx);
        Self {
            state: UiState::new(session_id),
            ws_rx: event_rx,
            action_tx,
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

    fn send_action(&self, action: UserAction) {
        let _ = self.action_tx.send(action);
    }

    fn task_id(&self) -> String {
        self.state
            .manifest
            .as_ref()
            .map(|m| m.task_id.clone())
            .unwrap_or_else(|| "unknown".into())
    }

    fn handle_key(&mut self, code: KeyCode, modifiers: KeyModifiers) -> bool {
        // q quits except while typing a command (allow literal q in buffer)
        if matches!(code, KeyCode::Char('q'))
            && !matches!(self.state.nav, NavMode::CommandInsert { .. })
        {
            return true;
        }

        // AwaitEnrich: ignore nav keys (still allow q via above)
        if matches!(self.state.nav, NavMode::AwaitEnrich { .. }) {
            return false;
        }

        if self.state.nav.is_waiting() {
            return false;
        }

        match &self.state.nav {
            NavMode::Idle => self.handle_idle_key(code, modifiers),
            NavMode::Browse => self.handle_browse_key(code, modifiers),
            NavMode::TableInteract { .. } => self.handle_table_key(code),
            NavMode::DetailScreen { .. } => self.handle_detail_key(code),
            NavMode::CommandInsert { .. } => self.handle_command_key(code),
            NavMode::AwaitDetail { .. }
            | NavMode::AwaitBoard { .. }
            | NavMode::AwaitEnrich { .. } => false,
        }
    }

    fn handle_idle_key(&mut self, code: KeyCode, modifiers: KeyModifiers) -> bool {
        match code {
            KeyCode::Char('i') => {
                self.state.enter_browse();
            }
            KeyCode::Esc => {}
            KeyCode::Tab => self.state.focus_next(),
            KeyCode::BackTab => self.state.focus_prev(),
            KeyCode::Char('j') | KeyCode::Down => self.state.scroll_focused(1),
            KeyCode::Char('k') | KeyCode::Up => self.state.scroll_focused(-1),
            KeyCode::PageDown => {
                let step = if modifiers.contains(KeyModifiers::SHIFT) {
                    1
                } else {
                    PAGE_STEP
                };
                self.state.page_scroll_by(step as i32);
            }
            KeyCode::PageUp => {
                let step = if modifiers.contains(KeyModifiers::SHIFT) {
                    1
                } else {
                    PAGE_STEP
                };
                self.state.page_scroll_by(-(step as i32));
            }
            KeyCode::Char('[') => self.state.focus_prev(),
            KeyCode::Char(']') => self.state.focus_next(),
            _ => {}
        }
        false
    }

    fn handle_browse_key(&mut self, code: KeyCode, modifiers: KeyModifiers) -> bool {
        match code {
            KeyCode::Esc => {
                self.state.nav = NavMode::Idle;
            }
            KeyCode::Enter => {
                self.state.try_activate_hovered();
            }
            KeyCode::Down | KeyCode::Up => {
                let dir = if code == KeyCode::Down { 1 } else { -1 };
                self.state.page_scroll_by(dir * PAGE_STEP as i32);
            }
            KeyCode::PageDown => {
                let step = if modifiers.contains(KeyModifiers::SHIFT) {
                    1
                } else {
                    PAGE_STEP
                };
                self.state.page_scroll_by(step as i32);
            }
            KeyCode::PageUp => {
                let step = if modifiers.contains(KeyModifiers::SHIFT) {
                    1
                } else {
                    PAGE_STEP
                };
                self.state.page_scroll_by(-(step as i32));
            }
            KeyCode::Tab => self.state.focus_next(),
            KeyCode::BackTab => self.state.focus_prev(),
            KeyCode::Char('j') => self.state.scroll_focused(1),
            KeyCode::Char('k') => self.state.scroll_focused(-1),
            KeyCode::Char('[') => self.state.focus_prev(),
            KeyCode::Char(']') => self.state.focus_next(),
            _ => {}
        }
        false
    }

    fn handle_table_key(&mut self, code: KeyCode) -> bool {
        match code {
            KeyCode::Esc => {
                self.state.nav = NavMode::Browse;
                self.state.recompute_hover();
            }
            KeyCode::Down | KeyCode::Char('j') => self.state.table_move_row(1),
            KeyCode::Up | KeyCode::Char('k') => self.state.table_move_row(-1),
            KeyCode::Enter => {
                if let NavMode::TableInteract { widget_id, row } = &self.state.nav {
                    let widget_id = widget_id.clone();
                    let row = *row;
                    let cells = self
                        .state
                        .manifest
                        .as_ref()
                        .and_then(|m| {
                            m.layout
                                .chunks
                                .iter()
                                .find(|c| c.widget_id == widget_id)
                                .and_then(|c| table_row_cells(c, row))
                        })
                        .unwrap_or_default();
                    self.state.detail_ctx = Some(DetailCtx {
                        source_widget_id: widget_id.clone(),
                        row_index: Some(row),
                        row: cells.clone(),
                    });
                    let action =
                        UserAction::select_row(self.task_id(), widget_id.clone(), row, cells);
                    self.send_action(action);
                    self.state.nav = NavMode::AwaitDetail { widget_id, row };
                }
            }
            _ => {}
        }
        false
    }

    fn handle_detail_key(&mut self, code: KeyCode) -> bool {
        match code {
            KeyCode::Char('i') => {
                self.state.open_command_insert();
            }
            KeyCode::Esc => {
                if let NavMode::DetailScreen { from_widget } = &self.state.nav {
                    let from_widget = from_widget.clone();
                    self.send_action(UserAction::navigate_back(self.task_id(), from_widget.clone()));
                    self.state.nav = NavMode::AwaitBoard { from_widget };
                }
            }
            _ => {}
        }
        false
    }

    fn handle_command_key(&mut self, code: KeyCode) -> bool {
        match code {
            KeyCode::Esc => {
                self.state.cmd_cancel();
            }
            KeyCode::Enter => {
                if let Ok((from_widget, cmd)) = self.state.cmd_try_submit() {
                    let widget_id = self
                        .state
                        .detail_ctx
                        .as_ref()
                        .map(|c| c.source_widget_id.clone())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| {
                            if from_widget.is_empty() {
                                "w_detail_body".into()
                            } else {
                                from_widget
                            }
                        });
                    let action = UserAction::command(
                        self.task_id(),
                        widget_id,
                        &cmd,
                        self.state.detail_ctx.as_ref(),
                    );
                    self.send_action(action);
                }
            }
            KeyCode::Backspace => self.state.cmd_backspace(),
            KeyCode::Char(c) if !c.is_control() => self.state.cmd_push_char(c),
            _ => {}
        }
        false
    }

    async fn event_loop(
        &mut self,
        terminal: &mut Terminal<CrosstermBackend<std::io::Stdout>>,
    ) -> Result<()> {
        let mut events = EventStream::new();
        let mut tick = tokio::time::interval(Duration::from_millis(80));

        loop {
            let size = terminal.size()?;
            let show_cmd = matches!(self.state.nav, NavMode::CommandInsert { .. });
            let constraints = if show_cmd {
                vec![
                    Constraint::Min(3),
                    Constraint::Length(1),
                    Constraint::Length(1),
                ]
            } else {
                vec![Constraint::Min(3), Constraint::Length(1)]
            };
            let body_chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints(constraints)
                .split(ratatui::layout::Rect {
                    x: 0,
                    y: 0,
                    width: size.width,
                    height: size.height,
                });
            sync_viewport(&mut self.state, body_chunks[0].width, body_chunks[0].height);

            terminal.draw(|f| draw(f, &self.state))?;

            tokio::select! {
                _ = tick.tick() => {}
                maybe_ev = events.next() => {
                    match maybe_ev {
                        Some(Ok(Event::Key(key))) if key.kind == KeyEventKind::Press => {
                            if self.handle_key(key.code, key.modifiers) {
                                return Ok(());
                            }
                        }
                        Some(Ok(Event::Resize(_, _))) => {}
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
