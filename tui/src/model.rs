use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TuiManifest {
    pub task_id: String,
    #[allow(dead_code)]
    pub operation: String,
    pub layout: TuiLayout,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TuiLayout {
    #[serde(default = "default_direction")]
    pub direction: String,
    pub chunks: Vec<TuiChunk>,
}

fn default_direction() -> String {
    "vertical".into()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TuiChunk {
    pub widget_id: String,
    #[serde(rename = "type")]
    pub widget_type: String,
    pub size: u16,
    #[serde(default)]
    pub props: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ParagraphProps {
    pub text: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TableProps {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListProps {
    pub items: Vec<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub selected_index: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GaugeProps {
    pub ratio: f64,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChartProps {
    pub datasets: Vec<ChartDataset>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChartDataset {
    pub name: String,
    pub data: Vec<f64>,
}

#[derive(Debug, Clone)]
pub enum WsStatus {
    Connecting,
    Live,
    Reconnecting,
    Error(String),
}

impl WsStatus {
    pub fn label(&self) -> String {
        match self {
            Self::Connecting => "connecting".into(),
            Self::Live => "live".into(),
            Self::Reconnecting => "reconnecting".into(),
            Self::Error(e) => format!("error: {e}"),
        }
    }
}

#[derive(Debug, Clone)]
pub enum ServerEvent {
    RenderManifest(TuiManifest),
    Status(WsStatus),
}
