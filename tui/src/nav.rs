//! Layered Vim-style navigation for the TUI board.

use crate::model::{TableProps, TuiChunk};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NavMode {
    Idle,
    Browse,
    TableInteract { widget_id: String, row: usize },
    AwaitDetail { widget_id: String, row: usize },
    DetailScreen { from_widget: String },
    CommandInsert {
        from_widget: String,
        buffer: String,
        error: Option<String>,
    },
    AwaitEnrich {
        from_widget: String,
        command: String,
    },
    AwaitBoard { from_widget: String },
}

impl NavMode {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Browse => "browse",
            Self::TableInteract { .. } => "table",
            Self::AwaitDetail { .. } => "await-detail",
            Self::DetailScreen { .. } => "detail",
            Self::CommandInsert { .. } => "cmd",
            Self::AwaitEnrich { .. } => "await-enrich",
            Self::AwaitBoard { .. } => "await-board",
        }
    }

    pub fn is_browse_like(&self) -> bool {
        matches!(self, Self::Browse)
    }

    pub fn is_waiting(&self) -> bool {
        matches!(
            self,
            Self::AwaitDetail { .. } | Self::AwaitBoard { .. } | Self::AwaitEnrich { .. }
        )
    }

    pub fn command_buffer(&self) -> Option<&str> {
        match self {
            Self::CommandInsert { buffer, .. } => Some(buffer.as_str()),
            _ => None,
        }
    }

    pub fn command_error(&self) -> Option<&str> {
        match self {
            Self::CommandInsert { error, .. } => error.as_deref(),
            _ => None,
        }
    }
}

pub const PAGE_STEP: u16 = 5;
pub const KNOWN_COMMANDS: &[&str] = &["/details"];
pub const DETAILS_SYSTEM_PROMPT: &str = "more details";

pub fn normalize_command(raw: &str) -> String {
    let t = raw.trim();
    if t.is_empty() {
        return String::new();
    }
    if t.starts_with('/') {
        t.to_string()
    } else {
        format!("/{t}")
    }
}

pub fn validate_command(raw: &str) -> Result<String, String> {
    let cmd = normalize_command(raw);
    if cmd.is_empty() {
        return Err("empty command".into());
    }
    if !KNOWN_COMMANDS.contains(&cmd.as_str()) {
        return Err(format!("unknown command: {cmd} (try /details)"));
    }
    Ok(cmd)
}

/// Pick chunk index that best intersects the top third of the viewport.
pub fn hover_from_viewport(
    chunks: &[TuiChunk],
    heights: &[u16],
    page_scroll: u16,
    viewport_h: u16,
) -> Option<usize> {
    if chunks.is_empty() || heights.len() != chunks.len() {
        return None;
    }
    let band_end = (viewport_h / 3).max(1);
    let mut y: i32 = -(i32::from(page_scroll));
    let mut best: Option<(usize, i32)> = None;

    for (i, h) in heights.iter().enumerate() {
        let top = y;
        let bottom = y + i32::from(*h);
        y = bottom;

        let vis_top = top.max(0);
        let vis_bottom = bottom.min(i32::from(viewport_h));
        if vis_bottom <= vis_top {
            continue;
        }
        let overlap_top = vis_top.max(0);
        let overlap_bottom = vis_bottom.min(i32::from(band_end));
        let score = if overlap_bottom > overlap_top {
            overlap_bottom - overlap_top + 1000
        } else {
            vis_bottom - vis_top
        };
        match best {
            None => best = Some((i, score)),
            Some((_, best_score)) if score > best_score => best = Some((i, score)),
            _ => {}
        }
    }
    best.map(|(i, _)| i)
}

pub fn table_row_count(chunk: &TuiChunk) -> usize {
    serde_json::from_value::<TableProps>(chunk.props.clone())
        .map(|p| p.rows.len())
        .unwrap_or(0)
}

pub fn table_row_cells(chunk: &TuiChunk, row: usize) -> Option<Vec<String>> {
    let props = serde_json::from_value::<TableProps>(chunk.props.clone()).ok()?;
    props.rows.get(row).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn chunk(id: &str, ty: &str) -> TuiChunk {
        TuiChunk {
            widget_id: id.into(),
            widget_type: ty.into(),
            size: 4,
            props: json!({}),
        }
    }

    #[test]
    fn hover_picks_top_visible() {
        let chunks = vec![chunk("a", "Paragraph"), chunk("b", "Table"), chunk("c", "List")];
        let heights = vec![10u16, 10, 10];
        let idx = hover_from_viewport(&chunks, &heights, 10, 20);
        assert_eq!(idx, Some(1));
    }

    #[test]
    fn nav_mode_labels() {
        assert_eq!(NavMode::Idle.label(), "idle");
        assert_eq!(
            NavMode::TableInteract {
                widget_id: "w".into(),
                row: 0
            }
            .label(),
            "table"
        );
        assert_eq!(
            NavMode::CommandInsert {
                from_widget: "w".into(),
                buffer: "/".into(),
                error: None,
            }
            .label(),
            "cmd"
        );
    }

    #[test]
    fn page_step_matches_plan() {
        assert_eq!(PAGE_STEP, 5);
    }

    #[test]
    fn validate_details_command() {
        assert_eq!(validate_command("/details").unwrap(), "/details");
        assert_eq!(validate_command("details").unwrap(), "/details");
        assert!(validate_command("/unknown").is_err());
        assert!(validate_command("").is_err());
    }
}
