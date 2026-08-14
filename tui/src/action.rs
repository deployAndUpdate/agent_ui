use serde::Serialize;
use serde_json::Value;

use crate::model::TuiManifest;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAction {
    pub event: &'static str,
    pub task_id: String,
    pub widget_id: String,
    pub action: String,
    pub payload: Value,
}

impl UserAction {
    pub fn select_row(
        task_id: impl Into<String>,
        widget_id: impl Into<String>,
        row_index: usize,
        row: Vec<String>,
    ) -> Self {
        Self {
            event: "USER_ACTION",
            task_id: task_id.into(),
            widget_id: widget_id.into(),
            action: "select_row".into(),
            payload: serde_json::json!({
                "rowIndex": row_index,
                "row": row,
            }),
        }
    }

    pub fn navigate_back(task_id: impl Into<String>, widget_id: impl Into<String>) -> Self {
        Self {
            event: "USER_ACTION",
            task_id: task_id.into(),
            widget_id: widget_id.into(),
            action: "navigate_back".into(),
            payload: serde_json::json!({}),
        }
    }
}

/// Apply incoming manifest under current nav mode.
pub fn on_manifest_received(mode: &mut crate::nav::NavMode, _manifest: &TuiManifest) {
    use crate::nav::NavMode;
    match mode {
        NavMode::AwaitDetail { widget_id, .. } => {
            *mode = NavMode::DetailScreen {
                from_widget: widget_id.clone(),
            };
        }
        NavMode::AwaitBoard { .. } => {
            *mode = NavMode::Browse;
        }
        NavMode::DetailScreen { .. } => {}
        NavMode::Idle | NavMode::Browse | NavMode::TableInteract { .. } => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nav::NavMode;
    use crate::model::TuiManifest;

    fn dummy_manifest() -> TuiManifest {
        TuiManifest {
            task_id: "t".into(),
            operation: "SYNC_DASHBOARD".into(),
            layout: crate::model::TuiLayout {
                direction: "vertical".into(),
                chunks: vec![],
            },
        }
    }

    #[test]
    fn await_detail_becomes_detail_screen() {
        let mut mode = NavMode::AwaitDetail {
            widget_id: "w_table".into(),
            row: 2,
        };
        on_manifest_received(&mut mode, &dummy_manifest());
        assert_eq!(
            mode,
            NavMode::DetailScreen {
                from_widget: "w_table".into()
            }
        );
    }

    #[test]
    fn await_board_becomes_browse() {
        let mut mode = NavMode::AwaitBoard {
            from_widget: "w_table".into(),
        };
        on_manifest_received(&mut mode, &dummy_manifest());
        assert_eq!(mode, NavMode::Browse);
    }
}
