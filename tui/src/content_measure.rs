//! Measure widget content to pick layout heights and table column widths.

use crate::model::{ListProps, ParagraphProps, TableProps, TuiChunk};

const BORDER: u16 = 2;

/// Approximate wrapped line count (char-based; good enough for Latin/Cyrillic TUI).
pub fn wrap_line_count(text: &str, width: u16) -> u16 {
    let w = width.max(1) as usize;
    let mut lines: u16 = 0;
    for para in text.split('\n') {
        if para.is_empty() {
            lines = lines.saturating_add(1);
            continue;
        }
        let len = para.chars().count().max(1);
        let needed = ((len + w - 1) / w) as u16;
        lines = lines.saturating_add(needed.max(1));
    }
    lines.max(1)
}

/// Inner content width for a chunk given outer terminal width (borders + padding).
pub fn inner_width(term_width: u16) -> u16 {
    term_width.saturating_sub(BORDER).saturating_sub(2).max(8)
}

/// Max height a single chunk may occupy before relying on in-widget scroll.
pub fn height_cap(viewport_h: u16) -> u16 {
    (viewport_h.saturating_mul(2) / 3).clamp(10, 28)
}

/// Content-desired height (may exceed cap — then widget scrolls).
pub fn content_height(chunk: &TuiChunk, term_width: u16) -> u16 {
    let iw = inner_width(term_width);
    match chunk.widget_type.as_str() {
        "Paragraph" => {
            let text = serde_json::from_value::<ParagraphProps>(chunk.props.clone())
                .map(|p| p.text)
                .unwrap_or_else(|_| chunk.props.to_string());
            wrap_line_count(&text, iw).saturating_add(BORDER)
        }
        "Table" => {
            let rows = serde_json::from_value::<TableProps>(chunk.props.clone())
                .map(|p| p.rows.len() as u16)
                .unwrap_or(0);
            // borders + header + rows
            BORDER.saturating_add(1).saturating_add(rows)
        }
        "List" => {
            let n = serde_json::from_value::<ListProps>(chunk.props.clone())
                .map(|p| p.items.len() as u16)
                .unwrap_or(0);
            BORDER.saturating_add(n.max(1))
        }
        "Gauge" => 3,
        "Chart" => chunk.size.clamp(10, 18),
        _ => chunk.size.clamp(3, 10),
    }
}

/// Height allocated in the page layout for this chunk.
pub fn allocated_height(chunk: &TuiChunk, term_width: u16, viewport_h: u16) -> u16 {
    let min_h = match chunk.widget_type.as_str() {
        "Gauge" => 3,
        "Chart" => 8,
        "Table" => 5,
        "List" => 4,
        "Paragraph" => 3,
        _ => 3,
    };
    let desired = content_height(chunk, term_width);
    let hint = chunk.size.saturating_add(BORDER).max(min_h);
    let cap = height_cap(viewport_h);
    desired.max(hint).min(cap).max(min_h)
}

/// Column width hints from header/cell string lengths.
pub fn table_col_maxes(headers: &[String], rows: &[Vec<String>]) -> Vec<u16> {
    let n = headers.len().max(1);
    let mut maxes = vec![1u16; n];
    for (i, h) in headers.iter().enumerate() {
        maxes[i] = maxes[i].max(h.chars().count() as u16);
    }
    for row in rows {
        for (i, cell) in row.iter().enumerate().take(n) {
            maxes[i] = maxes[i].max(cell.chars().count() as u16);
        }
    }
    maxes
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn wrap_counts_long_line() {
        let text = "a".repeat(40);
        assert_eq!(wrap_line_count(&text, 10), 4);
    }

    #[test]
    fn paragraph_taller_when_long() {
        let chunk = TuiChunk {
            widget_id: "p".into(),
            widget_type: "Paragraph".into(),
            size: 2,
            props: json!({ "text": "x".repeat(200) }),
        };
        let h = content_height(&chunk, 40);
        assert!(h > 5, "expected tall content height, got {h}");
    }
}
