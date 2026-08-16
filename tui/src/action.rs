use serde::Serialize;
use serde_json::Value;

use crate::model::TuiManifest;
use crate::nav::{PromptScope, DETAILS_SYSTEM_PROMPT};

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
    pub cache_slot: String,
}

#[derive(Debug, Clone, Default)]
pub struct CommandMeta {
    pub user_prompt: Option<String>,
    pub focused_widget_id: Option<String>,
    pub focused_chunk: Option<Value>,
    pub current_detail: Option<Value>,
    pub scope: PromptScope,
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

    pub fn select_point(
        task_id: impl Into<String>,
        widget_id: impl Into<String>,
        kind: &str,
        series_index: usize,
        series_name: &str,
        point_index: usize,
        label: &str,
        value: f64,
        percent: Option<f64>,
    ) -> Self {
        Self {
            event: "USER_ACTION",
            task_id: task_id.into(),
            widget_id: widget_id.into(),
            action: "select_point".into(),
            payload: serde_json::json!({
                "kind": kind,
                "seriesIndex": series_index,
                "seriesName": series_name,
                "pointIndex": point_index,
                "label": label,
                "value": value,
                "percent": percent,
                "rowIndex": point_index,
                "row": [series_name, label, value.to_string()],
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
        meta: Option<&CommandMeta>,
    ) -> Self {
        let task_id = task_id.into();
        let widget_id = widget_id.into();
        let user_prompt = meta.and_then(|m| m.user_prompt.as_deref()).unwrap_or("");
        let system_prompt = if command == "/details" {
            DETAILS_SYSTEM_PROMPT
        } else {
            user_prompt
        };
        let mut payload = serde_json::json!({
            "command": command,
            "systemPrompt": system_prompt,
            "detailTaskId": task_id.clone(),
            "context": { "sessionHint": true },
        });
        if let Some(obj) = payload.as_object_mut() {
            if command == "/prompt" {
                obj.insert("userPrompt".into(), Value::String(user_prompt.to_string()));
            }
            let scope = meta.map(|m| m.scope).unwrap_or(PromptScope::Detail);
            obj.insert("scope".into(), Value::String(scope.as_str().into()));
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
            if let Some(meta) = meta {
                if let Some(id) = &meta.focused_widget_id {
                    obj.insert("focusedWidgetId".into(), Value::String(id.clone()));
                }
                if let Some(chunk) = &meta.focused_chunk {
                    obj.insert("focusedChunk".into(), chunk.clone());
                }
                if let Some(detail) = &meta.current_detail {
                    obj.insert("currentDetail".into(), detail.clone());
                }
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
        NavMode::AwaitEnrich {
            from_widget,
            scope,
            resume_browse,
            ..
        } => {
            if *scope == PromptScope::Board {
                if !is_detail {
                    *mode = if *resume_browse {
                        NavMode::Browse
                    } else {
                        NavMode::Idle
                    };
                }
            } else if is_detail {
                *mode = NavMode::DetailScreen {
                    from_widget: from_widget.clone(),
                };
            }
        }
        NavMode::AwaitBoard { .. } => {
            *mode = NavMode::Browse;
        }
        NavMode::DetailScreen { .. }
        | NavMode::DetailBrowse { .. }
        | NavMode::PromptInsert { .. } => {
            if !is_detail {
                *mode = NavMode::Browse;
            } else if let NavMode::PromptInsert {
                from_widget,
                scope,
                resume_browse,
                ..
            } = mode
            {
                if *scope == PromptScope::Board {
                    *mode = if *resume_browse {
                        NavMode::Browse
                    } else {
                        NavMode::Idle
                    };
                } else {
                    let fw = from_widget.clone();
                    *mode = NavMode::DetailScreen { from_widget: fw };
                }
            }
        }
        NavMode::Idle
        | NavMode::Browse
        | NavMode::TableInteract { .. }
        | NavMode::ChartInteract { .. } => {
            if is_detail {
                let from_widget = match mode {
                    NavMode::TableInteract { widget_id, .. }
                    | NavMode::ChartInteract { widget_id, .. } => widget_id.clone(),
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
    use crate::model::TuiManifest;
    use crate::nav::{should_auto_details, NavMode};

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
    fn board_while_on_detail_browse_returns_to_browse() {
        let mut mode = NavMode::DetailBrowse {
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
            scope: PromptScope::Detail,
            resume_browse: false,
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
    fn await_enrich_board_restores_idle() {
        let mut mode = NavMode::AwaitEnrich {
            from_widget: String::new(),
            command: "/prompt".into(),
            scope: PromptScope::Board,
            resume_browse: false,
        };
        on_manifest_received(&mut mode, &dummy_manifest());
        assert_eq!(mode, NavMode::Idle);
    }

    #[test]
    fn await_enrich_board_restores_browse() {
        let mut mode = NavMode::AwaitEnrich {
            from_widget: String::new(),
            command: "/prompt".into(),
            scope: PromptScope::Board,
            resume_browse: true,
        };
        on_manifest_received(&mut mode, &dummy_manifest());
        assert_eq!(mode, NavMode::Browse);
    }

    #[test]
    fn await_enrich_board_ignores_detail_manifest() {
        let enrich = NavMode::AwaitEnrich {
            from_widget: String::new(),
            command: "/prompt".into(),
            scope: PromptScope::Board,
            resume_browse: false,
        };
        let mut mode = enrich.clone();
        let mut m = dummy_manifest();
        m.task_id = "detail_w_table_0".into();
        on_manifest_received(&mut mode, &m);
        assert_eq!(mode, enrich);
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
                cache_slot: "1".into(),
            }),
            None,
        );
        assert_eq!(a.action, "command");
        assert_eq!(a.payload["command"], "/details");
        assert_eq!(a.payload["systemPrompt"], "more details");
        assert_eq!(a.payload["rowIndex"], 1);
    }

    #[test]
    fn prompt_action_includes_focus_and_user_text() {
        let a = UserAction::command(
            "detail_w_1",
            "w_detail_body",
            "/prompt",
            Some(&DetailCtx {
                source_widget_id: "w_table".into(),
                row_index: Some(0),
                row: vec!["x".into()],
                cache_slot: "0".into(),
            }),
            Some(&CommandMeta {
                user_prompt: Some("add a list of facts".into()),
                focused_widget_id: Some("w_detail_body".into()),
                focused_chunk: Some(serde_json::json!({
                    "widgetId": "w_detail_body",
                    "type": "Paragraph",
                })),
                current_detail: Some(serde_json::json!({ "taskId": "detail_w_1" })),
                scope: PromptScope::Detail,
            }),
        );
        assert_eq!(a.payload["command"], "/prompt");
        assert_eq!(a.payload["systemPrompt"], "add a list of facts");
        assert_eq!(a.payload["userPrompt"], "add a list of facts");
        assert_eq!(a.payload["focusedWidgetId"], "w_detail_body");
        assert_eq!(a.payload["focusedChunk"]["widgetId"], "w_detail_body");
        assert_eq!(a.payload["currentDetail"]["taskId"], "detail_w_1");
        assert_eq!(a.payload["scope"], "detail");
    }

    #[test]
    fn board_prompt_payload_keeps_session_task_and_board_scope() {
        let a = UserAction::command(
            "task_7749",
            "w_header",
            "/prompt",
            None,
            Some(&CommandMeta {
                user_prompt: Some("add a list".into()),
                focused_widget_id: Some("w_header".into()),
                focused_chunk: Some(serde_json::json!({
                    "widgetId": "w_header",
                    "type": "Paragraph",
                })),
                current_detail: Some(serde_json::json!({ "taskId": "task_7749" })),
                scope: PromptScope::Board,
            }),
        );
        assert_eq!(a.task_id, "task_7749");
        assert_eq!(a.payload["scope"], "board");
        assert!(!a.task_id.starts_with("detail_"));
    }

    #[test]
    fn auto_details_flag_skips_agent_callback() {
        let stub_before = NavMode::AwaitDetail {
            widget_id: "w".into(),
            row: 0,
        };
        let mut after = stub_before.clone();
        let mut m = dummy_manifest();
        m.task_id = "detail_w_0".into();
        on_manifest_received(&mut after, &m);
        assert!(should_auto_details(&stub_before, &after, false));
        assert!(!should_auto_details(&stub_before, &after, true));
    }

    #[test]
    fn select_point_payload() {
        let a = UserAction::select_point(
            "task_1",
            "w_pie",
            "pie",
            0,
            "share",
            2,
            "EMEA",
            42.0,
            Some(0.31),
        );
        assert_eq!(a.action, "select_point");
        assert_eq!(a.payload["kind"], "pie");
        assert_eq!(a.payload["seriesIndex"], 0);
        assert_eq!(a.payload["pointIndex"], 2);
        assert_eq!(a.payload["label"], "EMEA");
        assert_eq!(a.payload["value"], 42.0);
        assert_eq!(a.payload["percent"], 0.31);
    }
}
