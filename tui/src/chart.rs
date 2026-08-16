//! Chart kind helpers shared by nav, render, and USER_ACTION payload.

use crate::model::{ChartProps, TuiChunk};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChartKind {
    Line,
    Bar,
    Sparkline,
    Pie,
    Stacked,
}

impl ChartKind {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(|s| s.to_ascii_lowercase()).as_deref() {
            Some("bar") => Self::Bar,
            Some("sparkline") => Self::Sparkline,
            Some("pie") => Self::Pie,
            Some("stacked") => Self::Stacked,
            _ => Self::Line,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Line => "line",
            Self::Bar => "bar",
            Self::Sparkline => "sparkline",
            Self::Pie => "pie",
            Self::Stacked => "stacked",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChartSlice {
    pub name: String,
    pub value: f64,
}

pub fn props_from_chunk(chunk: &TuiChunk) -> Option<ChartProps> {
    serde_json::from_value(chunk.props.clone()).ok()
}

pub fn kind_of(props: &ChartProps) -> ChartKind {
    ChartKind::parse(props.kind.as_deref())
}

fn clamp_nonneg(v: f64) -> f64 {
    if v.is_finite() && v > 0.0 {
        v
    } else {
        0.0
    }
}

/// Pie slices: one series + labels, or N series with a single value each.
pub fn pie_slices(props: &ChartProps) -> Vec<ChartSlice> {
    if props.datasets.is_empty() {
        return vec![];
    }
    let n_series_single = props.datasets.iter().all(|d| d.data.len() <= 1);
    if props.datasets.len() > 1 && n_series_single {
        return props
            .datasets
            .iter()
            .map(|d| ChartSlice {
                name: d.name.clone(),
                value: clamp_nonneg(d.data.first().copied().unwrap_or(0.0)),
            })
            .collect();
    }
    let ds = &props.datasets[0];
    ds.data
        .iter()
        .enumerate()
        .map(|(i, v)| ChartSlice {
            name: props
                .labels
                .as_ref()
                .and_then(|l| l.get(i))
                .cloned()
                .unwrap_or_else(|| format!("{}", i + 1)),
            value: clamp_nonneg(*v),
        })
        .collect()
}

pub fn series_count(props: &ChartProps, kind: ChartKind) -> usize {
    match kind {
        ChartKind::Pie => 1,
        _ => props.datasets.len().max(1),
    }
}

pub fn point_count(props: &ChartProps, kind: ChartKind) -> usize {
    match kind {
        ChartKind::Pie => pie_slices(props).len(),
        _ => props
            .datasets
            .iter()
            .map(|d| d.data.len())
            .max()
            .unwrap_or(0),
    }
}

pub fn category_label(props: &ChartProps, index: usize) -> String {
    props
        .labels
        .as_ref()
        .and_then(|l| l.get(index))
        .cloned()
        .unwrap_or_else(|| index.to_string())
}

/// Selected (seriesName, label, value, percent).
pub fn selected_point(
    props: &ChartProps,
    kind: ChartKind,
    series: usize,
    index: usize,
) -> Option<(String, String, f64, Option<f64>)> {
    match kind {
        ChartKind::Pie => {
            let slices = pie_slices(props);
            let slice = slices.get(index)?;
            let sum: f64 = slices.iter().map(|s| s.value).sum();
            let pct = if sum > 0.0 {
                Some(slice.value / sum)
            } else {
                None
            };
            let series_name = props
                .datasets
                .first()
                .map(|d| d.name.clone())
                .unwrap_or_else(|| "share".into());
            Some((series_name, slice.name.clone(), slice.value, pct))
        }
        _ => {
            let ds = props.datasets.get(series)?;
            let value = *ds.data.get(index)?;
            let label = category_label(props, index);
            Some((ds.name.clone(), label, value, None))
        }
    }
}

pub fn chart_cache_slot(series: usize, index: usize) -> String {
    format!("s{series}:i{index}")
}

pub fn table_cache_slot(row: usize) -> String {
    row.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ChartDataset;

    fn props(kind: &str, data: Vec<f64>, labels: Option<Vec<String>>) -> ChartProps {
        ChartProps {
            kind: Some(kind.into()),
            title: None,
            labels,
            datasets: vec![ChartDataset {
                name: "share".into(),
                data,
            }],
        }
    }

    #[test]
    fn unknown_kind_is_line() {
        assert_eq!(ChartKind::parse(Some("radar")), ChartKind::Line);
        assert_eq!(ChartKind::parse(None), ChartKind::Line);
    }

    #[test]
    fn pie_from_one_series_and_labels() {
        let p = props(
            "pie",
            vec![30.0, 20.0, 50.0],
            Some(vec!["a".into(), "b".into(), "c".into()]),
        );
        let s = pie_slices(&p);
        assert_eq!(s.len(), 3);
        assert_eq!(s[2].name, "c");
        assert_eq!(s[2].value, 50.0);
        let sel = selected_point(&p, ChartKind::Pie, 0, 2).unwrap();
        assert_eq!(sel.1, "c");
        assert!((sel.3.unwrap() - 0.5).abs() < 1e-9);
    }

    #[test]
    fn pie_zero_sum_has_no_percent() {
        let p = props("pie", vec![-1.0, 0.0], None);
        let s = pie_slices(&p);
        assert_eq!(s.iter().map(|x| x.value).sum::<f64>(), 0.0);
        assert!(selected_point(&p, ChartKind::Pie, 0, 0)
            .unwrap()
            .3
            .is_none());
    }

    #[test]
    fn cache_slot_does_not_collide_with_row() {
        assert_eq!(table_cache_slot(2), "2");
        assert_eq!(chart_cache_slot(0, 2), "s0:i2");
        assert_ne!(table_cache_slot(2), chart_cache_slot(0, 2));
    }
}
