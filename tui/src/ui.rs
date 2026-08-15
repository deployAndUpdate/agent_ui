use std::collections::HashMap;
use std::time::Instant;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::Frame;

use crate::action::DetailCtx;
use crate::content_measure::allocated_height;
use crate::layout_chunks::constraints_from_chunks;
use crate::loader::{ring_lines, spinner_frame, status_phrase};
use crate::model::{TuiChunk, TuiManifest, WsStatus};
use crate::nav::{hover_from_viewport, should_auto_details, table_row_count, NavMode, PAGE_STEP};
use crate::widgets_render::{render_chunk, ChunkRenderOpts};

pub struct UiState {
    pub session_id: String,
    pub status: WsStatus,
    pub manifest: Option<TuiManifest>,
    pub page_scroll: u16,
    pub focus: usize,
    pub hover: usize,
    pub widget_scroll: HashMap<String, u16>,
    pub nav: NavMode,
    pub last_body_h: u16,
    pub last_body_w: u16,
    pub detail_ctx: Option<DetailCtx>,
    /// When `/details` or `/prompt` was submitted; drives spinner until detail arrives.
    pub wait_started: Option<Instant>,
    /// One auto `/details` per row-open (not on later agent SYNC).
    pub details_auto_sent: bool,
    pending_auto_details: bool,
    /// Cyan Tab-focus is armed only after Tab/[ / ] on the detail board.
    pub detail_focus: bool,
}

impl UiState {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            status: WsStatus::Connecting,
            manifest: None,
            page_scroll: 0,
            focus: 0,
            hover: 0,
            widget_scroll: HashMap::new(),
            nav: NavMode::Idle,
            last_body_h: 24,
            last_body_w: 80,
            detail_ctx: None,
            wait_started: None,
            details_auto_sent: false,
            pending_auto_details: false,
            detail_focus: false,
        }
    }

    pub fn set_manifest(&mut self, manifest: TuiManifest) {
        let before = self.nav.clone();
        crate::action::on_manifest_received(&mut self.nav, &manifest);
        self.pending_auto_details =
            should_auto_details(&before, &self.nav, self.details_auto_sent);
        let reset_view = matches!(
            self.nav,
            NavMode::Idle
                | NavMode::Browse
                | NavMode::DetailScreen { .. }
                | NavMode::TableInteract { .. }
        );
        self.manifest = Some(manifest);
        if reset_view {
            if matches!(
                self.nav,
                NavMode::Idle | NavMode::Browse | NavMode::DetailScreen { .. }
            ) {
                self.page_scroll = 0;
                self.widget_scroll.clear();
            }
            if matches!(self.nav, NavMode::Idle) {
                self.focus = 0;
                self.hover = 0;
            }
            if matches!(self.nav, NavMode::DetailScreen { .. })
                && matches!(before, NavMode::AwaitDetail { .. } | NavMode::AwaitEnrich { .. })
            {
                self.focus = 0;
                self.detail_focus = false;
            }
        }
        if matches!(self.nav, NavMode::Browse | NavMode::Idle) {
            self.detail_ctx = None;
            self.details_auto_sent = false;
            self.detail_focus = false;
        }
        if !matches!(self.nav, NavMode::AwaitEnrich { .. }) {
            self.wait_started = None;
        }
        self.recompute_hover();
    }

    pub fn consume_auto_details(&mut self) -> bool {
        let v = self.pending_auto_details;
        self.pending_auto_details = false;
        v
    }

    pub fn enter_await_enrich(&mut self, command: &str) {
        let from_widget = match &self.nav {
            NavMode::DetailScreen { from_widget }
            | NavMode::AwaitEnrich { from_widget, .. }
            | NavMode::PromptInsert { from_widget, .. } => from_widget.clone(),
            NavMode::AwaitDetail { widget_id, .. } => widget_id.clone(),
            _ => String::new(),
        };
        self.nav = NavMode::AwaitEnrich {
            from_widget,
            command: command.to_string(),
        };
        self.wait_started = Some(Instant::now());
        if command == "/details" {
            self.details_auto_sent = true;
        }
    }

    pub fn current_detail_json(&self) -> Option<serde_json::Value> {
        serde_json::to_value(self.manifest.as_ref()?).ok()
    }

    pub fn focused_widget_id(&self) -> Option<String> {
        if !self.detail_focus {
            return None;
        }
        let idx = self.focused_chunk_index()?;
        self.manifest
            .as_ref()?
            .layout
            .chunks
            .get(idx)
            .map(|c| c.widget_id.clone())
    }

    pub fn focused_chunk_json(&self) -> Option<serde_json::Value> {
        if !self.detail_focus {
            return None;
        }
        let idx = self.focused_chunk_index()?;
        let c = self.manifest.as_ref()?.layout.chunks.get(idx)?;
        Some(serde_json::json!({
            "widgetId": c.widget_id,
            "type": c.widget_type,
            "size": c.size,
            "props": c.props,
        }))
    }

    pub fn scrollable_indices(&self) -> Vec<usize> {
        let Some(m) = &self.manifest else {
            return vec![];
        };
        m.layout
            .chunks
            .iter()
            .enumerate()
            .filter(|(_, c)| matches!(c.widget_type.as_str(), "Paragraph" | "Table" | "List"))
            .map(|(i, _)| i)
            .collect()
    }

    pub fn focused_chunk_index(&self) -> Option<usize> {
        let ids = self.scrollable_indices();
        if ids.is_empty() {
            return None;
        }
        Some(ids[self.focus % ids.len()])
    }

    pub fn hover_chunk_index(&self) -> Option<usize> {
        let Some(m) = &self.manifest else {
            return None;
        };
        let n = m.layout.chunks.len();
        if n == 0 {
            return None;
        }
        Some(self.hover % n)
    }

    pub fn hovered_chunk(&self) -> Option<&TuiChunk> {
        let idx = self.hover_chunk_index()?;
        self.manifest.as_ref()?.layout.chunks.get(idx)
    }

    pub fn focus_next(&mut self) {
        let n = self.scrollable_indices().len();
        if n == 0 {
            return;
        }
        if matches!(self.nav, NavMode::DetailScreen { .. }) && !self.detail_focus {
            self.detail_focus = true;
            self.focus = 0;
            return;
        }
        self.focus = (self.focus + 1) % n;
        if matches!(self.nav, NavMode::DetailScreen { .. }) {
            self.detail_focus = true;
        }
    }

    pub fn focus_prev(&mut self) {
        let n = self.scrollable_indices().len();
        if n == 0 {
            return;
        }
        if matches!(self.nav, NavMode::DetailScreen { .. }) && !self.detail_focus {
            self.detail_focus = true;
            self.focus = n - 1;
            return;
        }
        self.focus = (self.focus + n - 1) % n;
        if matches!(self.nav, NavMode::DetailScreen { .. }) {
            self.detail_focus = true;
        }
    }

    pub fn scroll_focused(&mut self, delta: i32) {
        let Some(idx) = self.focused_chunk_index() else {
            return;
        };
        let id = self
            .manifest
            .as_ref()
            .and_then(|m| m.layout.chunks.get(idx))
            .map(|c| c.widget_id.clone());
        let Some(id) = id else {
            return;
        };
        let cur = *self.widget_scroll.get(&id).unwrap_or(&0);
        let next = if delta < 0 {
            cur.saturating_sub((-delta) as u16)
        } else {
            cur.saturating_add(delta as u16)
        };
        self.widget_scroll.insert(id, next);
    }

    pub fn page_scroll_by(&mut self, delta: i32) {
        if delta < 0 {
            self.page_scroll = self.page_scroll.saturating_sub((-delta) as u16);
        } else {
            self.page_scroll = self.page_scroll.saturating_add(delta as u16);
        }
        if self.nav.is_browse_like() {
            self.recompute_hover();
        }
    }

    pub fn recompute_hover(&mut self) {
        let Some(m) = &self.manifest else {
            return;
        };
        let heights: Vec<u16> = m
            .layout
            .chunks
            .iter()
            .map(|c| allocated_height(c, self.last_body_w, self.last_body_h))
            .collect();
        if let Some(idx) =
            hover_from_viewport(&m.layout.chunks, &heights, self.page_scroll, self.last_body_h)
        {
            self.hover = idx;
        }
    }

    pub fn enter_browse(&mut self) {
        self.nav = NavMode::Browse;
        self.recompute_hover();
    }

    pub fn try_activate_hovered(&mut self) -> bool {
        let Some(chunk) = self.hovered_chunk().cloned() else {
            return false;
        };
        if chunk.widget_type != "Table" {
            return false;
        }
        let rows = table_row_count(&chunk);
        self.nav = NavMode::TableInteract {
            widget_id: chunk.widget_id,
            row: 0.min(rows.saturating_sub(1)),
        };
        true
    }

    pub fn table_move_row(&mut self, delta: i32) {
        let NavMode::TableInteract { widget_id, row } = &self.nav else {
            return;
        };
        let widget_id = widget_id.clone();
        let row = *row;
        let Some(chunk) = self
            .manifest
            .as_ref()
            .and_then(|m| m.layout.chunks.iter().find(|c| c.widget_id == widget_id))
        else {
            return;
        };
        let n = table_row_count(chunk);
        if n == 0 {
            return;
        }
        let next = if delta < 0 {
            row.saturating_sub((-delta) as usize)
        } else {
            (row + delta as usize).min(n - 1)
        };
        self.nav = NavMode::TableInteract {
            widget_id: widget_id.clone(),
            row: next,
        };
        let visible = self.last_body_h.saturating_sub(6).max(1) as usize;
        let scroll = next.saturating_sub(visible.saturating_sub(1));
        self.widget_scroll.insert(widget_id, scroll as u16);
    }

    pub fn open_prompt_insert(&mut self) {
        let from_widget = match &self.nav {
            NavMode::DetailScreen { from_widget } => from_widget.clone(),
            _ => String::new(),
        };
        self.nav = NavMode::PromptInsert {
            from_widget,
            focused_widget: self.focused_widget_id(),
            buffer: String::new(),
            error: None,
        };
    }

    pub fn prompt_push_char(&mut self, c: char) {
        if let NavMode::PromptInsert { buffer, error, .. } = &mut self.nav {
            buffer.push(c);
            *error = None;
        }
    }

    pub fn prompt_backspace(&mut self) {
        if let NavMode::PromptInsert { buffer, error, .. } = &mut self.nav {
            buffer.pop();
            *error = None;
        }
    }

    pub fn prompt_cancel(&mut self) {
        if let NavMode::PromptInsert { from_widget, .. } = &self.nav {
            let from_widget = from_widget.clone();
            self.nav = NavMode::DetailScreen { from_widget };
        }
    }

    pub fn prompt_try_submit(&mut self) -> Result<String, ()> {
        let NavMode::PromptInsert { buffer, .. } = &self.nav else {
            return Err(());
        };
        let text = buffer.trim().to_string();
        if text.is_empty() {
            if let NavMode::PromptInsert { error, .. } = &mut self.nav {
                *error = Some("empty prompt".into());
            }
            return Err(());
        }
        Ok(text)
    }
}

pub fn draw(frame: &mut Frame, state: &UiState) {
    let area = frame.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(area);

    draw_body(frame, chunks[0], state);
    if matches!(state.nav, NavMode::AwaitEnrich { .. }) {
        draw_enrich_overlay(frame, chunks[0], state);
    }
    if matches!(state.nav, NavMode::PromptInsert { .. }) {
        draw_prompt_overlay(frame, chunks[0], state);
    }
    draw_status(frame, chunks[1], state);
}

fn draw_prompt_overlay(frame: &mut Frame, area: Rect, state: &UiState) {
    let buf = state.nav.prompt_buffer().unwrap_or("");
    let err = state.nav.prompt_error();
    let focused = match &state.nav {
        NavMode::PromptInsert { focused_widget, .. } => focused_widget
            .as_deref()
            .unwrap_or("whole detail"),
        _ => "whole detail",
    };

    let width = 56.min(area.width.saturating_sub(2)).max(28);
    let height = 9.min(area.height.saturating_sub(1)).max(7);
    let overlay = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, overlay);

    let mut lines = vec![
        Line::from(Span::styled(
            format!(" widget: {focused}"),
            Style::default().fg(Color::Cyan),
        )),
        Line::from(""),
        Line::from(vec![
            Span::styled("> ", Style::default().fg(Color::Yellow)),
            Span::styled(
                format!("{buf}\u{2588}"),
                Style::default().fg(Color::White).add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(""),
    ];
    if let Some(e) = err {
        lines.push(Line::from(Span::styled(
            format!("! {e}"),
            Style::default().fg(Color::Red),
        )));
    } else {
        lines.push(Line::from(Span::styled(
            "Enter send · Esc cancel",
            Style::default().fg(Color::DarkGray),
        )));
    }

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(
            Style::default()
                .fg(Color::Magenta)
                .add_modifier(Modifier::BOLD),
        )
        .title(Span::styled(
            " prompt ",
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ));
    frame.render_widget(Paragraph::new(lines).block(block), overlay);
}

fn draw_enrich_overlay(frame: &mut Frame, area: Rect, state: &UiState) {
    let elapsed = state
        .wait_started
        .map(|t| t.elapsed().as_millis())
        .unwrap_or(0);
    let frame_i = spinner_frame(elapsed);
    let phrase = status_phrase(elapsed);
    let cmd = match &state.nav {
        NavMode::AwaitEnrich { command, .. } => command.as_str(),
        _ => "/details",
    };

    let width = 42.min(area.width.saturating_sub(2)).max(24);
    let height = 13.min(area.height.saturating_sub(1)).max(11);
    let overlay = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, overlay);

    let mut lines: Vec<Line> = vec![Line::from("")];
    for row in ring_lines(frame_i) {
        lines.push(Line::from(Span::styled(
            format!("    {row}"),
            Style::default().fg(Color::Cyan),
        )));
    }
    lines.push(Line::from(""));
    lines.push(Line::from(vec![
        Span::raw("    "),
        Span::styled(
            phrase,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled("…", Style::default().fg(Color::Yellow)),
    ]));
    lines.push(Line::from(Span::styled(
        "    holding this screen until the board arrives",
        Style::default().fg(Color::DarkGray),
    )));

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )
        .title(Span::styled(
            format!(" {cmd} "),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ));
    frame.render_widget(Paragraph::new(lines).block(block), overlay);
}

fn draw_body(frame: &mut Frame, area: Rect, state: &UiState) {
    let Some(manifest) = &state.manifest else {
        let msg = Paragraph::new(vec![
            Line::from(Span::styled(
                "Visual Engine · TUI",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
            Line::from(Span::styled(
                "Waiting for RENDER_MANIFEST\u{2026}",
                Style::default().fg(Color::Gray),
            )),
            Line::from(Span::raw(format!("session={}", state.session_id))),
        ])
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray))
                .title(" idle "),
        );
        frame.render_widget(msg, area);
        return;
    };

    if manifest.layout.chunks.is_empty() {
        let p = Paragraph::new("empty layout.chunks").block(
            Block::default()
                .borders(Borders::ALL)
                .title(manifest.task_id.clone()),
        );
        frame.render_widget(p, area);
        return;
    }

    if manifest.layout.direction == "horizontal" {
        draw_horizontal(frame, area, &manifest.layout.chunks, state);
    } else {
        draw_vertical_scroll(frame, area, &manifest.layout.chunks, state);
    }
}

fn chunk_opts(state: &UiState, chunk_index: usize, chunk: &TuiChunk) -> ChunkRenderOpts {
    let scroll = *state.widget_scroll.get(&chunk.widget_id).unwrap_or(&0);
    let idle_focused = (matches!(state.nav, NavMode::Idle)
        || (matches!(state.nav, NavMode::DetailScreen { .. }) && state.detail_focus))
        && state.focused_chunk_index() == Some(chunk_index);

    let yellow = match &state.nav {
        NavMode::Browse => state.hover_chunk_index() == Some(chunk_index),
        NavMode::TableInteract { widget_id, .. }
        | NavMode::AwaitDetail { widget_id, .. } => widget_id == &chunk.widget_id,
        _ => false,
    };

    let active = matches!(
        &state.nav,
        NavMode::TableInteract { widget_id, .. } if widget_id == &chunk.widget_id
    );

    let selected_row = match &state.nav {
        NavMode::TableInteract { widget_id, row }
        | NavMode::AwaitDetail { widget_id, row }
            if widget_id == &chunk.widget_id =>
        {
            Some(*row)
        }
        _ => None,
    };

    ChunkRenderOpts {
        focused: idle_focused,
        hovered: yellow,
        active,
        scroll,
        selected_row,
    }
}

fn draw_horizontal(frame: &mut Frame, area: Rect, chunks: &[TuiChunk], state: &UiState) {
    let constraints = constraints_from_chunks(chunks);
    let layout = Layout::default()
        .direction(Direction::Horizontal)
        .constraints(constraints)
        .split(area);
    for (i, chunk) in chunks.iter().enumerate() {
        if let Some(rect) = layout.get(i) {
            render_chunk(frame, *rect, chunk, &chunk_opts(state, i, chunk));
        }
    }
}

fn draw_vertical_scroll(frame: &mut Frame, area: Rect, chunks: &[TuiChunk], state: &UiState) {
    let heights: Vec<u16> = chunks
        .iter()
        .map(|c| allocated_height(c, area.width, area.height))
        .collect();
    let total_h: u16 = heights.iter().sum();
    let max_scroll = total_h.saturating_sub(area.height);
    let page_scroll = state.page_scroll.min(max_scroll);

    let mut y_cursor: i32 = area.y as i32 - i32::from(page_scroll);
    for (i, (chunk, h)) in chunks.iter().zip(heights.iter()).enumerate() {
        let top = y_cursor;
        let bottom = y_cursor + i32::from(*h);
        y_cursor = bottom;

        let visible_top = top.max(i32::from(area.y));
        let visible_bottom = bottom.min(i32::from(area.y.saturating_add(area.height)));
        if visible_bottom <= visible_top {
            continue;
        }

        let show_full = top >= i32::from(area.y) && bottom <= i32::from(area.y + area.height);
        let rect = if show_full {
            Rect {
                x: area.x,
                y: top as u16,
                width: area.width,
                height: *h,
            }
        } else {
            Rect {
                x: area.x,
                y: visible_top as u16,
                width: area.width,
                height: (visible_bottom - visible_top) as u16,
            }
        };

        if rect.height < 2 {
            continue;
        }

        render_chunk(frame, rect, chunk, &chunk_opts(state, i, chunk));
    }
}

fn mode_hint(state: &UiState) -> String {
    let hover_id = state
        .hovered_chunk()
        .map(|c| c.widget_id.as_str())
        .unwrap_or("-");
    match &state.nav {
        NavMode::Idle => "i browse · Tab focus · ↑↓ widget · PgUp/Dn page · q".into(),
        NavMode::Browse => format!("↑↓ page · Enter open · Esc idle · hover={hover_id}"),
        NavMode::TableInteract { .. } => "↑↓ row · Enter open · Esc back".into(),
        NavMode::AwaitDetail { .. } => "waiting for detail\u{2026}".into(),
        NavMode::DetailScreen { .. } => "Tab focus · p prompt · Esc board · q quit".into(),
        NavMode::PromptInsert { .. } => "type prompt · Enter send · Esc cancel".into(),
        NavMode::AwaitEnrich { .. } => "request in flight · q quit".into(),
        NavMode::AwaitBoard { .. } => "waiting for board\u{2026}".into(),
    }
}

fn draw_status(frame: &mut Frame, area: Rect, state: &UiState) {
    let task = state
        .manifest
        .as_ref()
        .map(|m| m.task_id.as_str())
        .unwrap_or("-");
    let n = state
        .manifest
        .as_ref()
        .map(|m| m.layout.chunks.len())
        .unwrap_or(0);
    let focus_id = state
        .focused_chunk_index()
        .and_then(|i| state.manifest.as_ref()?.layout.chunks.get(i))
        .map(|c| c.widget_id.as_str())
        .unwrap_or("-");
    let status_color = match &state.status {
        WsStatus::Live => Color::Green,
        WsStatus::Connecting | WsStatus::Reconnecting => Color::Yellow,
        WsStatus::Error(_) => Color::Red,
    };
    let mode_color = match &state.nav {
        NavMode::Idle => Color::DarkGray,
        NavMode::Browse => Color::Yellow,
        NavMode::TableInteract { .. } => Color::Yellow,
        NavMode::DetailScreen { .. } => Color::Magenta,
        NavMode::PromptInsert { .. } => Color::Yellow,
        NavMode::AwaitDetail { .. }
        | NavMode::AwaitBoard { .. }
        | NavMode::AwaitEnrich { .. } => Color::Yellow,
    };
    let line = Line::from(vec![
        Span::styled(" TUI ", Style::default().bg(Color::Cyan).fg(Color::Black)),
        Span::raw(" "),
        Span::styled(state.status.label(), Style::default().fg(status_color)),
        Span::raw(" · "),
        Span::styled(
            format!("mode={}", state.nav.label()),
            Style::default().fg(mode_color),
        ),
        Span::raw(" · "),
        Span::styled(
            format!("session={}", state.session_id),
            Style::default().fg(Color::Gray),
        ),
        Span::raw(" · "),
        Span::styled(format!("task={task}"), Style::default().fg(Color::Gray)),
        Span::raw(" · "),
        Span::styled(format!("chunks={n}"), Style::default().fg(Color::Gray)),
        Span::raw(" · "),
        Span::styled(
            format!("focus={focus_id}"),
            Style::default().fg(Color::Cyan),
        ),
        Span::raw(" · "),
        Span::styled(mode_hint(state), Style::default().fg(Color::DarkGray)),
    ]);
    frame.render_widget(Paragraph::new(line), area);
}

pub fn sync_viewport(state: &mut UiState, body_w: u16, body_h: u16) {
    let changed = state.last_body_w != body_w || state.last_body_h != body_h;
    state.last_body_w = body_w;
    state.last_body_h = body_h;
    if changed && state.nav.is_browse_like() {
        state.recompute_hover();
    }
    let _ = PAGE_STEP;
}
