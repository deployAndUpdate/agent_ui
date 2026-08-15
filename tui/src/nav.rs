//! Layered Vim-style navigation for the TUI board.

use crate::model::{TableProps, TuiChunk};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NavMode {
    Idle,
    Browse,
    TableInteract { widget_id: String, row: usize },
    AwaitDetail { widget_id: String, row: usize },
    DetailScreen { from_widget: String },
    /// Browse-like yellow hover + arrow paging on the detail board (`i` from DetailScreen).
    DetailBrowse { from_widget: String },
    PromptInsert {
        from_widget: String,
        focused_widget: Option<String>,
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
            Self::DetailBrowse { .. } => "detail-browse",
            Self::PromptInsert { .. } => "prompt",
            Self::AwaitEnrich { .. } => "await-enrich",
            Self::AwaitBoard { .. } => "await-board",
        }
    }

    pub fn is_browse_like(&self) -> bool {
        matches!(self, Self::Browse | Self::DetailBrowse { .. })
    }

    pub fn is_waiting(&self) -> bool {
        matches!(
            self,
            Self::AwaitDetail { .. } | Self::AwaitBoard { .. } | Self::AwaitEnrich { .. }
        )
    }

    pub fn prompt_buffer(&self) -> Option<&str> {
        match self {
            Self::PromptInsert { buffer, .. } => Some(buffer.as_str()),
            _ => None,
        }
    }

    pub fn prompt_error(&self) -> Option<&str> {
        match self {
            Self::PromptInsert { error, .. } => error.as_deref(),
            _ => None,
        }
    }

    pub fn is_typing(&self) -> bool {
        matches!(self, Self::PromptInsert { .. })
    }
}

pub const PAGE_STEP: u16 = 5;
pub const DETAILS_SYSTEM_PROMPT: &str = "more details";

pub fn detail_cache_key(widget_id: &str, row: usize) -> String {
    format!("{widget_id}:{row}")
}

/// After the builtin stub lands, send `/details` once (not on later agent callbacks).
pub fn should_auto_details(before: &NavMode, after: &NavMode, already_sent: bool) -> bool {
    !already_sent
        && matches!(before, NavMode::AwaitDetail { .. })
        && matches!(after, NavMode::DetailScreen { .. })
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
            NavMode::PromptInsert {
                from_widget: "w".into(),
                focused_widget: None,
                buffer: "hello".into(),
                error: None,
            }
            .label(),
            "prompt"
        );
        assert_eq!(
            NavMode::DetailBrowse {
                from_widget: "w".into()
            }
            .label(),
            "detail-browse"
        );
        assert!(NavMode::DetailBrowse {
            from_widget: "w".into()
        }
        .is_browse_like());
    }

    #[test]
    fn page_step_matches_plan() {
        assert_eq!(PAGE_STEP, 5);
    }

    #[test]
    fn auto_details_only_once_after_stub() {
        let before = NavMode::AwaitDetail {
            widget_id: "w_table".into(),
            row: 0,
        };
        let after = NavMode::DetailScreen {
            from_widget: "w_table".into(),
        };
        assert!(should_auto_details(&before, &after, false));
        assert!(!should_auto_details(&before, &after, true));
        let enrich = NavMode::AwaitEnrich {
            from_widget: "w_table".into(),
            command: "/details".into(),
        };
        let after_agent = NavMode::DetailScreen {
            from_widget: "w_table".into(),
        };
        assert!(!should_auto_details(&enrich, &after_agent, true));
        assert!(!should_auto_details(&enrich, &after_agent, false));
    }

    #[test]
    fn cache_key_is_stable() {
        assert_eq!(detail_cache_key("w_table", 3), "w_table:3");
    }
}
