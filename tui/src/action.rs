use serde::Serialize;
use serde_json::Value;

use crate::model::TuiManifest;
use crate::nav::DETAILS_SYSTEM_PROMPT;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAction {
    pub event: &'static str,
    pub task_id: String,
    pub widget_id: String,
    pub action: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct DetailCtx {
    pub source_widget_id: String,
    pub row_index: Option<usize>,
    pub row: Vec<String>,
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

    pub fn command(
        task_id: impl Into<String>,
        widget_id: impl Into<String>,
        command: &str,
        detail_ctx: Option<&DetailCtx>,
    ) -> Self {
        let task_id = task_id.into();
        let widget_id = widget_id.into();
        let system_prompt = if command == "/details" {
            DETAILS_SYSTEM_PROMPT
        } else {
            ""
        };
        let mut payload = serde_json::json!({
            "command": command,
            "systemPrompt": system_prompt,
            "detailTaskId": task_id.clone(),
            "context": { "sessionHint": true },
        });
        if let Some(obj) = payload.as_object_mut() {
            if let Some(ctx) = detail_ctx {
                obj.insert(
                    "rowIndex".into(),
                    match ctx.row_index {
                        Some(i) => Value::from(i),
                        None => Value::Null,
                    },
                );
                obj.insert("row".into(), Value::from(ctx.row.clone()));
                obj.insert(
                    "sourceWidgetId".into(),
                    Value::String(ctx.source_widget_id.clone()),
                );
            } else {
                obj.insert("rowIndex".into(), Value::Null);
            }
        }
        Self {
            event: "USER_ACTION",
            task_id,
            widget_id,
            action: "command".into(),
            payload,
        }
    }
}

/// Apply incoming manifest under current nav mode.
pub fn on_manifest_received(mode: &mut crate::nav::NavMode, manifest: &TuiManifest) {
    use crate::nav::NavMode;
    let is_detail = manifest.task_id.starts_with("detail_");
    match mode {
        NavMode::AwaitDetail { widget_id, .. } => {
            *mode = NavMode::DetailScreen {
                from_widget: widget_id.clone(),
            };
        }
        NavMode::AwaitEnrich { from_widget, .. } => {
            if is_detail {
                *mode = NavMode::DetailScreen {
                    from_widget: from_widget.clone(),
                };
            }
        }
        NavMode::AwaitBoard { .. } => {
            *mode = NavMode::Browse;
        }
        NavMode::DetailScreen { .. } | NavMode::CommandInsert { .. } => {
            if !is_detail {
                *mode = NavMode::Browse;
            } else if matches!(mode, NavMode::CommandInsert { .. }) {
                // enriched detail while somehow in cmd — return to detail
                if let NavMode::CommandInsert { from_widget, .. } = mode {
                    let fw = from_widget.clone();
                    *mode = NavMode::DetailScreen { from_widget: fw };
                }
            }
        }
        NavMode::Idle | NavMode::Browse | NavMode::TableInteract { .. } => {
            if is_detail {
                let from_widget = match mode {
                    NavMode::TableInteract { widget_id, .. } => widget_id.clone(),
                    _ => String::new(),
                };
                *mode = NavMode::DetailScreen { from_widget };
            }
        }
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

    #[test]
    fn detail_overlay_enters_detail_from_idle() {
        let mut mode = NavMode::Idle;
        let mut m = dummy_manifest();
        m.task_id = "detail_w_results_0".into();
        on_manifest_received(&mut mode, &m);
        assert_eq!(
            mode,
            NavMode::DetailScreen {
                from_widget: String::new()
            }
        );
    }

    #[test]
    fn board_while_on_detail_returns_to_browse() {
        let mut mode = NavMode::DetailScreen {
            from_widget: "w_table".into(),
        };
        on_manifest_received(&mut mode, &dummy_manifest());
        assert_eq!(mode, NavMode::Browse);
    }

    #[test]
    fn await_enrich_stays_detail_on_detail_manifest() {
        let mut mode = NavMode::AwaitEnrich {
            from_widget: "w_table".into(),
            command: "/details".into(),
        };
        let mut m = dummy_manifest();
        m.task_id = "detail_w_table_0".into();
        on_manifest_received(&mut mode, &m);
        assert_eq!(
            mode,
            NavMode::DetailScreen {
                from_widget: "w_table".into()
            }
        );
    }

    #[test]
    fn command_action_payload() {
        let a = UserAction::command(
            "detail_w_1",
            "w_table",
            "/details",
            Some(&DetailCtx {
                source_widget_id: "w_table".into(),
                row_index: Some(1),
                row: vec!["a".into(), "b".into()],
            }),
        );
        assert_eq!(a.action, "command");
        assert_eq!(a.payload["command"], "/details");
        assert_eq!(a.payload["systemPrompt"], "more details");
        assert_eq!(a.payload["rowIndex"], 1);
    }
}
