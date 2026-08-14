use ratatui::layout::Constraint;

use crate::model::TuiChunk;

/// Map chunk.size weights to layout Constraints (Ratio).
pub fn constraints_from_chunks(chunks: &[TuiChunk]) -> Vec<Constraint> {
    if chunks.is_empty() {
        return vec![Constraint::Fill(1)];
    }
    let total: u32 = chunks.iter().map(|c| u32::from(c.size.max(1))).sum();
    chunks
        .iter()
        .map(|c| Constraint::Ratio(u32::from(c.size.max(1)), total.max(1)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TuiChunk;
    use serde_json::json;

    #[test]
    fn ratios_sum_weights() {
        let chunks = vec![
            TuiChunk {
                widget_id: "a".into(),
                widget_type: "Paragraph".into(),
                size: 1,
                props: json!({}),
            },
            TuiChunk {
                widget_id: "b".into(),
                widget_type: "Table".into(),
                size: 3,
                props: json!({}),
            },
        ];
        let c = constraints_from_chunks(&chunks);
        assert_eq!(c.len(), 2);
    }
}
