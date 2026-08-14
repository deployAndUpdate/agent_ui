use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::layout_chunks::constraints_from_chunks;
use crate::model::{TuiChunk, TuiManifest, WsStatus};
use crate::widgets_render::render_chunk;

pub struct UiState {
    pub session_id: String,
    pub status: WsStatus,
    pub manifest: Option<TuiManifest>,
    /// Vertical scroll offset in terminal rows (PgUp/PgDown).
    pub scroll: u16,
}

impl UiState {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            status: WsStatus::Connecting,
            manifest: None,
            scroll: 0,
        }
    }
}

/// Prefer readable min heights over Ratio squeeze (visual-first).
pub fn chunk_height(chunk: &TuiChunk) -> u16 {
    let s = chunk.size.max(1);
    match chunk.widget_type.as_str() {
        "Gauge" => 3,
        "Paragraph" => s.clamp(3, 8),
        "List" => s.clamp(4, 12),
        "Table" => s.clamp(6, 18),
        "Chart" => s.clamp(10, 22),
        _ => s.clamp(3, 10),
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
        draw_horizontal(frame, area, &manifest.layout.chunks);
    } else {
        draw_vertical_scroll(frame, area, &manifest.layout.chunks, state.scroll);
    }
}

fn draw_horizontal(frame: &mut Frame, area: Rect, chunks: &[TuiChunk]) {
    let constraints = constraints_from_chunks(chunks);
    let layout = Layout::default()
        .direction(Direction::Horizontal)
        .constraints(constraints)
        .split(area);
    for (i, chunk) in chunks.iter().enumerate() {
        if let Some(rect) = layout.get(i) {
            render_chunk(frame, *rect, chunk);
        }
    }
}

fn draw_vertical_scroll(frame: &mut Frame, area: Rect, chunks: &[TuiChunk], scroll: u16) {
    let heights: Vec<u16> = chunks.iter().map(chunk_height).collect();
    let total_h: u16 = heights.iter().sum();
    let max_scroll = total_h.saturating_sub(area.height);
    let scroll = scroll.min(max_scroll);

    let mut y_cursor: i32 = area.y as i32 - scroll as i32;
    for (chunk, h) in chunks.iter().zip(heights.iter()) {
        let top = y_cursor;
        let bottom = y_cursor + i32::from(*h);
        y_cursor = bottom;

        let visible_top = top.max(area.y as i32);
        let visible_bottom = bottom.min((area.y + area.height) as i32);
        if visible_bottom <= visible_top {
            continue;
        }
        let rect = Rect {
            x: area.x,
            y: visible_top as u16,
            width: area.width,
            height: (visible_bottom - visible_top) as u16,
        };
        // Only draw full widget if enough of the slot is visible (avoid tiny scraps).
        if rect.height >= 2 {
            render_chunk(frame, rect, chunk);
        }
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
            "PgUp/PgDn scroll · q quit",
            Style::default().fg(Color::DarkGray),
        ),
    ]);
    frame.render_widget(Paragraph::new(line), area);
}
