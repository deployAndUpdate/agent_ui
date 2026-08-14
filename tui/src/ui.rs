use std::collections::HashMap;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::content_measure::allocated_height;
use crate::layout_chunks::constraints_from_chunks;
use crate::model::{TuiChunk, TuiManifest, WsStatus};
use crate::widgets_render::{render_chunk, ChunkRenderOpts};

pub struct UiState {
    pub session_id: String,
    pub status: WsStatus,
    pub manifest: Option<TuiManifest>,
    /// Page (board) vertical scroll in rows.
    pub page_scroll: u16,
    /// Focus index into scrollable chunk indices (not raw chunk index).
    pub focus: usize,
    /// Per-widget vertical scroll offset.
    pub widget_scroll: HashMap<String, u16>,
}

impl UiState {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            status: WsStatus::Connecting,
            manifest: None,
            page_scroll: 0,
            focus: 0,
            widget_scroll: HashMap::new(),
        }
    }

    pub fn set_manifest(&mut self, manifest: TuiManifest) {
        self.manifest = Some(manifest);
        self.page_scroll = 0;
        self.focus = 0;
        self.widget_scroll.clear();
    }

    /// Chunk indices that support in-widget scroll.
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

    pub fn focus_next(&mut self) {
        let n = self.scrollable_indices().len();
        if n == 0 {
            return;
        }
        self.focus = (self.focus + 1) % n;
    }

    pub fn focus_prev(&mut self) {
        let n = self.scrollable_indices().len();
        if n == 0 {
            return;
        }
        self.focus = (self.focus + n - 1) % n;
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
}

pub fn draw(frame: &mut Frame, state: &UiState) {
    let area = frame.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(1)])
        .split(area);

    draw_body(frame, chunks[0], state);
    draw_status(frame, chunks[1], state);
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
                "Waiting for RENDER_MANIFEST…",
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

fn draw_horizontal(frame: &mut Frame, area: Rect, chunks: &[TuiChunk], state: &UiState) {
    let constraints = constraints_from_chunks(chunks);
    let layout = Layout::default()
        .direction(Direction::Horizontal)
        .constraints(constraints)
        .split(area);
    let focused = state.focused_chunk_index();
    for (i, chunk) in chunks.iter().enumerate() {
        if let Some(rect) = layout.get(i) {
            let scroll = *state.widget_scroll.get(&chunk.widget_id).unwrap_or(&0);
            render_chunk(
                frame,
                *rect,
                chunk,
                &ChunkRenderOpts {
                    focused: focused == Some(i),
                    scroll,
                },
            );
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
    let focused = state.focused_chunk_index();

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

        // Prefer drawing at full allocated height when mostly visible to avoid clip squeeze.
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

        let scroll = *state.widget_scroll.get(&chunk.widget_id).unwrap_or(&0);
        render_chunk(
            frame,
            rect,
            chunk,
            &ChunkRenderOpts {
                focused: focused == Some(i),
                scroll,
            },
        );
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
    let line = Line::from(vec![
        Span::styled(" TUI ", Style::default().bg(Color::Cyan).fg(Color::Black)),
        Span::raw(" "),
        Span::styled(state.status.label(), Style::default().fg(status_color)),
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
        Span::styled(
            "Tab focus · ↑↓ widget · PgUp/Dn page · q",
            Style::default().fg(Color::DarkGray),
        ),
    ]);
    frame.render_widget(Paragraph::new(line), area);
}
