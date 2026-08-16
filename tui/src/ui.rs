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
use crate::loader::{ring_lines, spinner_frame, status_phrase, RING_COLS};
use crate::model::{TuiChunk, TuiManifest, WsStatus};
use crate::nav::{
    detail_cache_key, hover_from_viewport, should_auto_details, table_row_count, NavMode,
    PromptScope, PAGE_STEP,
};
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
    /// Enriched detail boards keyed by `widgetId:row`.
    detail_cache: HashMap<String, TuiManifest>,
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
            detail_cache: HashMap::new(),
        }
    }

    pub fn set_manifest(&mut self, manifest: TuiManifest) {
        let before = self.nav.clone();
        crate::action::on_manifest_received(&mut self.nav, &manifest);
        self.pending_auto_details = should_auto_details(&before, &self.nav, self.details_auto_sent);
        let reset_view = matches!(
            self.nav,
            NavMode::Idle
                | NavMode::Browse
                | NavMode::DetailScreen { .. }
                | NavMode::DetailBrowse { .. }
                | NavMode::TableInteract { .. }
                | NavMode::ChartInteract { .. }
        );
        self.manifest = Some(manifest);
        if reset_view {
            if matches!(
                self.nav,
                NavMode::Idle
                    | NavMode::Browse
                    | NavMode::DetailScreen { .. }
                    | NavMode::DetailBrowse { .. }
            ) {
                self.page_scroll = 0;
                self.widget_scroll.clear();
            }
            if matches!(self.nav, NavMode::Idle) {
                self.focus = 0;
                self.hover = 0;
            }
            if matches!(
                self.nav,
                NavMode::DetailScreen { .. } | NavMode::DetailBrowse { .. }
            ) && matches!(
                before,
                NavMode::AwaitDetail { .. } | NavMode::AwaitEnrich { .. }
            ) {
                self.focus = 0;
                self.detail_focus = false;
            }
        }
        if matches!(self.nav, NavMode::Browse | NavMode::Idle) {
            self.detail_ctx = None;
            self.details_auto_sent = false;
            self.detail_focus = false;
        }
        if matches!(
            before,
            NavMode::AwaitEnrich { .. }
                | NavMode::PromptInsert { .. }
                | NavMode::DetailScreen { .. }
                | NavMode::DetailBrowse { .. }
        ) {
            if let Some(m) = &self.manifest {
                if m.task_id.starts_with("detail_") {
                    self.remember_detail(m.clone());
                }
            }
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
            | NavMode::DetailBrowse { from_widget }
            | NavMode::AwaitEnrich { from_widget, .. }
            | NavMode::PromptInsert { from_widget, .. } => from_widget.clone(),
            NavMode::AwaitDetail { widget_id, .. } => widget_id.clone(),
            _ => String::new(),
        };
        let (mut scope, mut resume_browse) = match &self.nav {
            NavMode::PromptInsert {
                scope,
                resume_browse,
                ..
            }
            | NavMode::AwaitEnrich {
                scope,
                resume_browse,
                ..
            } => (*scope, *resume_browse),
            NavMode::Idle => (PromptScope::Board, false),
            NavMode::Browse => (PromptScope::Board, true),
            _ => (PromptScope::Detail, false),
        };
        if command == "/details" {
            scope = PromptScope::Detail;
            resume_browse = false;
        }
        self.nav = NavMode::AwaitEnrich {
            from_widget,
            command: command.to_string(),
            scope,
            resume_browse,
        };
        self.wait_started = Some(Instant::now());
        if command == "/details" {
            self.details_auto_sent = true;
        }
    }

    pub fn remember_detail(&mut self, manifest: TuiManifest) {
        let Some(ctx) = &self.detail_ctx else {
            return;
        };
        if !manifest.task_id.starts_with("detail_") {
            return;
        }
        let key = detail_cache_key(&ctx.source_widget_id, &ctx.cache_slot);
        self.detail_cache.insert(key, manifest);
    }

    pub fn cached_detail(&self, widget_id: &str, slot: impl AsRef<str>) -> Option<TuiManifest> {
        self.detail_cache
            .get(&detail_cache_key(widget_id, slot))
            .cloned()
    }

    pub fn has_row_detail(&self, widget_id: &str, row: usize) -> bool {
        self.detail_cache.contains_key(&detail_cache_key(
            widget_id,
            crate::chart::table_cache_slot(row),
        ))
    }

    pub fn show_cached_detail(&mut self, widget_id: String, manifest: TuiManifest) {
        self.details_auto_sent = true;
        self.pending_auto_details = false;
        self.page_scroll = 0;
        self.widget_scroll.clear();
        self.focus = 0;
        self.detail_focus = false;
        self.nav = NavMode::DetailScreen {
            from_widget: widget_id,
        };
        self.manifest = Some(manifest);
        self.wait_started = None;
        self.recompute_hover();
    }

    pub fn enter_detail_browse(&mut self) {
        let from_widget = match &self.nav {
            NavMode::DetailScreen { from_widget } | NavMode::DetailBrowse { from_widget } => {
                from_widget.clone()
            }
            _ => String::new(),
        };
        self.nav = NavMode::DetailBrowse { from_widget };
        self.recompute_hover();
    }

    pub fn leave_detail_browse(&mut self) {
        if let NavMode::DetailBrowse { from_widget } = &self.nav {
            let from_widget = from_widget.clone();
            self.nav = NavMode::DetailScreen { from_widget };
        }
    }

    pub fn current_detail_json(&self) -> Option<serde_json::Value> {
        serde_json::to_value(self.manifest.as_ref()?).ok()
    }

    fn chunk_id_at_focus(&self) -> Option<String> {
        let idx = self.focused_chunk_index()?;
        self.manifest
            .as_ref()?
            .layout
            .chunks
            .get(idx)
            .map(|c| c.widget_id.clone())
    }

    pub fn focused_widget_id(&self) -> Option<String> {
        if let NavMode::PromptInsert { focused_widget, .. } = &self.nav {
            if focused_widget.is_some() {
                return focused_widget.clone();
            }
        }
        match &self.nav {
            NavMode::Idle
            | NavMode::PromptInsert {
                scope: PromptScope::Board,
                resume_browse: false,
                ..
            } => self.chunk_id_at_focus(),
            NavMode::Browse
            | NavMode::PromptInsert {
                scope: PromptScope::Board,
                resume_browse: true,
                ..
            } => self.hovered_chunk().map(|c| c.widget_id.clone()),
            NavMode::DetailBrowse { .. }
            | NavMode::PromptInsert {
                scope: PromptScope::Detail,
                resume_browse: true,
                ..
            } => {
                if self.detail_focus {
                    self.chunk_id_at_focus()
                } else {
                    self.hovered_chunk().map(|c| c.widget_id.clone())
                }
            }
            NavMode::DetailScreen { .. }
            | NavMode::PromptInsert {
                scope: PromptScope::Detail,
                resume_browse: false,
                ..
            } => {
                if self.detail_focus {
                    self.chunk_id_at_focus()
                } else {
                    None
                }
            }
            _ => {
                if self.detail_focus {
                    self.chunk_id_at_focus()
                } else {
                    None
                }
            }
        }
    }

    pub fn focused_chunk_json(&self) -> Option<serde_json::Value> {
        let id = self.focused_widget_id()?;
        let c = self
            .manifest
            .as_ref()?
            .layout
            .chunks
            .iter()
            .find(|c| c.widget_id == id)?;
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
        if matches!(
            self.nav,
            NavMode::DetailScreen { .. } | NavMode::DetailBrowse { .. }
        ) && !self.detail_focus
        {
            self.detail_focus = true;
            self.focus = 0;
            return;
        }
        self.focus = (self.focus + 1) % n;
        if matches!(
            self.nav,
            NavMode::DetailScreen { .. } | NavMode::DetailBrowse { .. }
        ) {
            self.detail_focus = true;
        }
    }

    pub fn focus_prev(&mut self) {
        let n = self.scrollable_indices().len();
        if n == 0 {
            return;
        }
        if matches!(
            self.nav,
            NavMode::DetailScreen { .. } | NavMode::DetailBrowse { .. }
        ) && !self.detail_focus
        {
            self.detail_focus = true;
            self.focus = n - 1;
            return;
        }
        self.focus = (self.focus + n - 1) % n;
        if matches!(
            self.nav,
            NavMode::DetailScreen { .. } | NavMode::DetailBrowse { .. }
        ) {
            self.detail_focus = true;
        }
    }

    pub fn scroll_focused(&mut self, delta: i32) {
        let idx = if matches!(self.nav, NavMode::DetailBrowse { .. }) && !self.detail_focus {
            self.hover_chunk_index()
        } else {
            self.focused_chunk_index()
        };
        let Some(idx) = idx else {
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
        if let Some(idx) = hover_from_viewport(
            &m.layout.chunks,
            &heights,
            self.page_scroll,
            self.last_body_h,
        ) {
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
        match chunk.widget_type.as_str() {
            "Table" => {
                let rows = table_row_count(&chunk);
                self.nav = NavMode::TableInteract {
                    widget_id: chunk.widget_id,
                    row: 0.min(rows.saturating_sub(1)),
                };
                true
            }
            "Chart" => {
                self.nav = NavMode::ChartInteract {
                    widget_id: chunk.widget_id,
                    series: 0,
                    index: 0,
                };
                true
            }
            _ => false,
        }
    }

    pub fn chart_move_index(&mut self, delta: i32) {
        let NavMode::ChartInteract {
            widget_id,
            series,
            index,
        } = &self.nav
        else {
            return;
        };
        let widget_id = widget_id.clone();
        let series = *series;
        let index = *index;
        let Some(props) = self
            .manifest
            .as_ref()
            .and_then(|m| m.layout.chunks.iter().find(|c| c.widget_id == widget_id))
            .and_then(crate::chart::props_from_chunk)
        else {
            return;
        };
        let kind = crate::chart::kind_of(&props);
        let n = crate::chart::point_count(&props, kind);
        if n == 0 {
            return;
        }
        let next = if delta < 0 {
            index.saturating_sub((-delta) as usize)
        } else {
            (index + delta as usize).min(n - 1)
        };
        self.nav = NavMode::ChartInteract {
            widget_id,
            series,
            index: next,
        };
    }

    pub fn chart_move_series(&mut self, delta: i32) {
        let NavMode::ChartInteract {
            widget_id,
            series,
            index,
        } = &self.nav
        else {
            return;
        };
        let widget_id = widget_id.clone();
        let series = *series;
        let index = *index;
        let Some(props) = self
            .manifest
            .as_ref()
            .and_then(|m| m.layout.chunks.iter().find(|c| c.widget_id == widget_id))
            .and_then(crate::chart::props_from_chunk)
        else {
            return;
        };
        let kind = crate::chart::kind_of(&props);
        if kind == crate::chart::ChartKind::Pie {
            return;
        }
        let n = crate::chart::series_count(&props, kind);
        if n == 0 {
            return;
        }
        let next = if delta < 0 {
            series.saturating_sub((-delta) as usize)
        } else {
            (series + delta as usize).min(n - 1)
        };
        let max_i = crate::chart::point_count(&props, kind).saturating_sub(1);
        self.nav = NavMode::ChartInteract {
            widget_id,
            series: next,
            index: index.min(max_i),
        };
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
        let focused_widget = self.focused_widget_id();
        let (from_widget, scope, resume_browse) = match &self.nav {
            NavMode::Idle => (String::new(), PromptScope::Board, false),
            NavMode::Browse => (String::new(), PromptScope::Board, true),
            NavMode::DetailScreen { from_widget } => {
                (from_widget.clone(), PromptScope::Detail, false)
            }
            NavMode::DetailBrowse { from_widget } => {
                (from_widget.clone(), PromptScope::Detail, true)
            }
            _ => return,
        };
        self.nav = NavMode::PromptInsert {
            from_widget,
            focused_widget,
            buffer: String::new(),
            error: None,
            scope,
            resume_browse,
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
        let NavMode::PromptInsert {
            from_widget,
            scope,
            resume_browse,
            ..
        } = &self.nav
        else {
            return;
        };
        let from_widget = from_widget.clone();
        self.nav = match (*scope, *resume_browse) {
            (PromptScope::Board, false) => NavMode::Idle,
            (PromptScope::Board, true) => NavMode::Browse,
            (PromptScope::Detail, true) => NavMode::DetailBrowse { from_widget },
            (PromptScope::Detail, false) => NavMode::DetailScreen { from_widget },
        };
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
        NavMode::PromptInsert {
            focused_widget,
            scope,
            ..
        } => focused_widget.as_deref().unwrap_or(match scope {
            PromptScope::Board => "board",
            PromptScope::Detail => "whole detail",
        }),
        _ => "board",
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
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
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

    let width = 32.min(area.width.saturating_sub(2)).max(22);
    let height = 13.min(area.height.saturating_sub(1)).max(11);
    let overlay = Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    };
    frame.render_widget(Clear, overlay);

    let inner_w = overlay.width.saturating_sub(2) as usize;
    let pad = inner_w.saturating_sub(RING_COLS) / 2;
    let pad_s: String = " ".repeat(pad);

    let mut lines: Vec<Line> = vec![Line::from("")];
    for row in ring_lines(frame_i) {
        let mut spans = vec![Span::raw(pad_s.clone())];
        for ch in row.chars() {
            spans.push(match ch {
                '●' => Span::styled(
                    "●",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                '•' => Span::styled("•", Style::default().fg(Color::Yellow)),
                '○' => Span::styled("○", Style::default().fg(Color::Cyan)),
                other => Span::raw(other.to_string()),
            });
        }
        lines.push(Line::from(spans));
    }
    lines.push(Line::from(""));
    let phrase_txt = format!("{phrase}…");
    let phrase_pad = " ".repeat(inner_w.saturating_sub(phrase_txt.chars().count()) / 2);
    lines.push(Line::from(vec![
        Span::raw(phrase_pad),
        Span::styled(
            phrase,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled("…", Style::default().fg(Color::Yellow)),
    ]));
    let hint = "waiting for board";
    let hint_pad = " ".repeat(inner_w.saturating_sub(hint.len()) / 2);
    lines.push(Line::from(Span::styled(
        format!("{hint_pad}{hint}"),
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
        || (matches!(
            state.nav,
            NavMode::DetailScreen { .. } | NavMode::DetailBrowse { .. }
        ) && state.detail_focus))
        && state.focused_chunk_index() == Some(chunk_index);

    let yellow = match &state.nav {
        NavMode::Browse | NavMode::DetailBrowse { .. } => {
            state.hover_chunk_index() == Some(chunk_index)
        }
        NavMode::TableInteract { widget_id, .. }
        | NavMode::ChartInteract { widget_id, .. }
        | NavMode::AwaitDetail { widget_id, .. } => widget_id == &chunk.widget_id,
        _ => false,
    };

    let active = matches!(
        &state.nav,
        NavMode::TableInteract { widget_id, .. } | NavMode::ChartInteract { widget_id, .. }
            if widget_id == &chunk.widget_id
    );

    let selected_row = match &state.nav {
        NavMode::TableInteract { widget_id, row } | NavMode::AwaitDetail { widget_id, row }
            if widget_id == &chunk.widget_id =>
        {
            Some(*row)
        }
        _ => None,
    };

    let (chart_series, chart_index) = match &state.nav {
        NavMode::ChartInteract {
            widget_id,
            series,
            index,
        } if widget_id == &chunk.widget_id => (Some(*series), Some(*index)),
        _ => (None, None),
    };

    let ready_rows = if chunk.widget_type == "Table" {
        let n = table_row_count(chunk);
        (0..n)
            .map(|r| state.has_row_detail(&chunk.widget_id, r))
            .collect()
    } else {
        vec![]
    };

    ChunkRenderOpts {
        focused: idle_focused,
        hovered: yellow,
        active,
        scroll,
        selected_row,
        chart_series,
        chart_index,
        ready_rows,
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
        NavMode::Idle => "i browse · Tab focus · p prompt · ↑↓ widget · PgUp/Dn page · q".into(),
        NavMode::Browse => format!("↑↓ page · p prompt · Enter open · Esc idle · hover={hover_id}"),
        NavMode::TableInteract { .. } => "↑↓ row · Enter open · Esc back".into(),
        NavMode::ChartInteract { .. } => "←→ point · ↑↓ series · Enter open · Esc back".into(),
        NavMode::AwaitDetail { .. } => "waiting for detail\u{2026}".into(),
        NavMode::DetailScreen { .. } => "i browse · Tab focus · p prompt · Esc board".into(),
        NavMode::DetailBrowse { .. } => {
            format!("↑↓ page · p prompt · Esc detail · hover={hover_id}")
        }
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
        NavMode::TableInteract { .. } | NavMode::ChartInteract { .. } => Color::Yellow,
        NavMode::DetailScreen { .. } => Color::Magenta,
        NavMode::DetailBrowse { .. } => Color::Yellow,
        NavMode::PromptInsert { .. } => Color::Yellow,
        NavMode::AwaitDetail { .. } | NavMode::AwaitBoard { .. } | NavMode::AwaitEnrich { .. } => {
            Color::Yellow
        }
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

#[cfg(test)]
mod cache_tests {
    use super::*;
    use crate::action::DetailCtx;
    use crate::model::{TuiChunk, TuiLayout, TuiManifest};
    use serde_json::json;

    fn para(text: &str) -> TuiManifest {
        TuiManifest {
            task_id: "detail_w_t_0".into(),
            operation: "SYNC_DASHBOARD".into(),
            layout: TuiLayout {
                direction: "vertical".into(),
                chunks: vec![TuiChunk {
                    widget_id: "w_body".into(),
                    widget_type: "Paragraph".into(),
                    size: 4,
                    props: json!({ "text": text }),
                }],
            },
        }
    }

    #[test]
    fn does_not_cache_builtin_stub() {
        let mut s = UiState::new("demo".into());
        s.detail_ctx = Some(DetailCtx {
            source_widget_id: "w_t".into(),
            row_index: Some(0),
            row: vec!["a".into()],
            cache_slot: "0".into(),
        });
        s.nav = NavMode::AwaitDetail {
            widget_id: "w_t".into(),
            row: 0,
        };
        s.set_manifest(para("stub"));
        assert!(s.cached_detail("w_t", "0").is_none());
        assert!(!s.has_row_detail("w_t", 0));
    }

    #[test]
    fn caches_agent_enrich_and_shows_on_reopen() {
        let mut s = UiState::new("demo".into());
        s.detail_ctx = Some(DetailCtx {
            source_widget_id: "w_t".into(),
            row_index: Some(0),
            row: vec!["a".into()],
            cache_slot: "0".into(),
        });
        s.nav = NavMode::AwaitEnrich {
            from_widget: "w_t".into(),
            command: "/details".into(),
            scope: PromptScope::Detail,
            resume_browse: false,
        };
        s.set_manifest(para("enriched"));
        let hit = s.cached_detail("w_t", "0").expect("cached");
        assert_eq!(hit.layout.chunks[0].props["text"], "enriched");

        s.show_cached_detail("w_t".into(), hit);
        assert!(matches!(s.nav, NavMode::DetailScreen { .. }));
        assert_eq!(
            s.manifest.as_ref().unwrap().layout.chunks[0].props["text"],
            "enriched"
        );
        assert!(s.details_auto_sent);
        assert!(!s.consume_auto_details());
        assert!(s.has_row_detail("w_t", 0));
        assert!(!s.has_row_detail("w_t", 1));
    }

    #[test]
    fn board_prompt_result_is_not_cached_as_detail() {
        let mut s = UiState::new("demo".into());
        s.nav = NavMode::AwaitEnrich {
            from_widget: String::new(),
            command: "/prompt".into(),
            scope: PromptScope::Board,
            resume_browse: false,
        };
        s.set_manifest(TuiManifest {
            task_id: "task_7749".into(),
            operation: "SYNC_DASHBOARD".into(),
            layout: TuiLayout {
                direction: "vertical".into(),
                chunks: vec![TuiChunk {
                    widget_id: "w_header".into(),
                    widget_type: "Paragraph".into(),
                    size: 3,
                    props: json!({ "text": "root" }),
                }],
            },
        });
        assert!(matches!(s.nav, NavMode::Idle));
        assert!(s.cached_detail("w_header", "0").is_none());
    }

    #[test]
    fn board_prompt_opens_and_cancels_back_to_idle() {
        let mut s = UiState::new("demo".into());
        s.nav = NavMode::Idle;
        s.open_prompt_insert();
        assert!(matches!(
            s.nav,
            NavMode::PromptInsert {
                scope: PromptScope::Board,
                resume_browse: false,
                ..
            }
        ));
        s.prompt_cancel();
        assert!(matches!(s.nav, NavMode::Idle));
    }

    #[test]
    fn board_prompt_from_browse_resumes_browse() {
        let mut s = UiState::new("demo".into());
        s.nav = NavMode::Browse;
        s.open_prompt_insert();
        assert!(matches!(
            s.nav,
            NavMode::PromptInsert {
                scope: PromptScope::Board,
                resume_browse: true,
                ..
            }
        ));
        s.prompt_cancel();
        assert!(matches!(s.nav, NavMode::Browse));
    }

    #[test]
    fn chart_enter_opens_interact() {
        let mut s = UiState::new("demo".into());
        s.nav = NavMode::Browse;
        s.manifest = Some(TuiManifest {
            task_id: "t".into(),
            operation: "SYNC_DASHBOARD".into(),
            layout: TuiLayout {
                direction: "vertical".into(),
                chunks: vec![TuiChunk {
                    widget_id: "w_pie".into(),
                    widget_type: "Chart".into(),
                    size: 8,
                    props: json!({
                        "kind": "pie",
                        "labels": ["a", "b"],
                        "datasets": [{ "name": "share", "data": [1, 2] }]
                    }),
                }],
            },
        });
        s.hover = 0;
        assert!(s.try_activate_hovered());
        assert!(matches!(
            s.nav,
            NavMode::ChartInteract {
                index: 0,
                series: 0,
                ..
            }
        ));
    }
}
