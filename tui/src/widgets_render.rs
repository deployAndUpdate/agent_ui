use ratatui::style::{Color, Modifier, Style};
use ratatui::symbols::Marker;
use ratatui::text::{Line, Span};
use ratatui::widgets::{
    Axis, Block, Borders, Cell, Chart, Dataset, Gauge, GraphType, List, ListItem, Paragraph, Row,
    Table, Wrap,
};
use ratatui::Frame;

use crate::model::{
    ChartProps, GaugeProps, ListProps, ParagraphProps, TableProps, TuiChunk,
};

const SERIES_COLORS: [Color; 6] = [
    Color::Cyan,
    Color::Magenta,
    Color::Yellow,
    Color::Green,
    Color::Blue,
    Color::LightRed,
];

pub fn style_name_to_color(name: Option<&str>) -> Color {
    match name.map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("cyan") => Color::Cyan,
        Some("green") => Color::Green,
        Some("yellow") => Color::Yellow,
        Some("red") => Color::Red,
        Some("magenta") => Color::Magenta,
        Some("blue") => Color::Blue,
        Some("white") => Color::White,
        _ => Color::Gray,
    }
}

fn titled_block(title: impl Into<String>, focused: bool) -> Block<'static> {
    let title = title.into();
    let border = if focused {
        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::DarkGray)
    };
    Block::default()
        .borders(Borders::ALL)
        .border_style(border)
        .title(Span::styled(
            title,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ))
}

pub fn render_chunk(frame: &mut Frame, area: ratatui::layout::Rect, chunk: &TuiChunk) {
    match chunk.widget_type.as_str() {
        "Paragraph" => render_paragraph(frame, area, chunk),
        "Table" => render_table(frame, area, chunk),
        "List" => render_list(frame, area, chunk),
        "Gauge" => render_gauge(frame, area, chunk),
        "Chart" => render_chart(frame, area, chunk),
        other => {
            let msg = format!("unknown type: {other}");
            let p = Paragraph::new(msg).block(titled_block(&chunk.widget_id, false));
            frame.render_widget(p, area);
        }
    }
}

fn render_paragraph(frame: &mut Frame, area: ratatui::layout::Rect, chunk: &TuiChunk) {
    let props: ParagraphProps = serde_json::from_value(chunk.props.clone()).unwrap_or(ParagraphProps {
        text: chunk.props.to_string(),
        title: Some(chunk.widget_id.clone()),
        style: None,
    });
    let color = style_name_to_color(props.style.as_deref());
    let title = props
        .title
        .clone()
        .unwrap_or_else(|| chunk.widget_id.clone());
    let block = titled_block(title, false).border_style(Style::default().fg(color));
    let para = Paragraph::new(props.text)
        .style(Style::default().fg(color))
        .wrap(Wrap { trim: true })
        .block(block);
    frame.render_widget(para, area);
}

fn render_table(frame: &mut Frame, area: ratatui::layout::Rect, chunk: &TuiChunk) {
    let Ok(props) = serde_json::from_value::<TableProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Table props").block(titled_block(&chunk.widget_id, false));
        frame.render_widget(p, area);
        return;
    };

    let header = Row::new(
        props
            .headers
            .iter()
            .map(|h| Cell::from(Span::styled(h.clone(), Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)))),
    )
    .height(1)
    .bottom_margin(0);

    let rows: Vec<Row> = props
        .rows
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let style = if i % 2 == 0 {
                Style::default().fg(Color::White)
            } else {
                Style::default().fg(Color::Gray)
            };
            Row::new(row.iter().cloned().map(Cell::from)).style(style)
        })
        .collect();

    let widths: Vec<ratatui::layout::Constraint> = if props.headers.is_empty() {
        vec![ratatui::layout::Constraint::Fill(1)]
    } else {
        props
            .headers
            .iter()
            .map(|_| ratatui::layout::Constraint::Fill(1))
            .collect()
    };

    let table = Table::new(rows, widths)
        .header(header)
        .block(titled_block(
            format!("▤ {}", chunk.widget_id),
            false,
        ))
        .column_spacing(1)
        .row_highlight_style(Style::default().bg(Color::DarkGray).fg(Color::Cyan));

    frame.render_widget(table, area);
}

fn render_list(frame: &mut Frame, area: ratatui::layout::Rect, chunk: &TuiChunk) {
    let Ok(props) = serde_json::from_value::<ListProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid List props").block(titled_block(&chunk.widget_id, false));
        frame.render_widget(p, area);
        return;
    };
    let title = props
        .title
        .clone()
        .unwrap_or_else(|| format!("• {}", chunk.widget_id));
    let selected = props.selected_index.unwrap_or(0);
    let items: Vec<ListItem> = props
        .items
        .iter()
        .enumerate()
        .map(|(i, text)| {
            let marker = if i == selected { "▸ " } else { "  " };
            let style = if i == selected {
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::Gray)
            };
            ListItem::new(Line::from(Span::styled(format!("{marker}{text}"), style)))
        })
        .collect();

    let list = List::new(items).block(titled_block(title, false));
    frame.render_widget(list, area);
}

fn render_gauge(frame: &mut Frame, area: ratatui::layout::Rect, chunk: &TuiChunk) {
    let Ok(props) = serde_json::from_value::<GaugeProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Gauge props").block(titled_block(&chunk.widget_id, false));
        frame.render_widget(p, area);
        return;
    };
    let ratio = props.ratio.clamp(0.0, 1.0);
    let title = props
        .title
        .clone()
        .unwrap_or_else(|| chunk.widget_id.clone());
    let label = props
        .label
        .clone()
        .unwrap_or_else(|| format!("{:.0}%", ratio * 100.0));

    let color = if ratio < 0.34 {
        Color::Blue
    } else if ratio < 0.67 {
        Color::Cyan
    } else {
        Color::Yellow
    };

    let gauge = Gauge::default()
        .block(titled_block(title, false))
        .gauge_style(Style::default().fg(color).bg(Color::Black))
        .ratio(ratio)
        .label(label);
    frame.render_widget(gauge, area);
}

fn render_chart(frame: &mut Frame, area: ratatui::layout::Rect, chunk: &TuiChunk) {
    let Ok(props) = serde_json::from_value::<ChartProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Chart props").block(titled_block(&chunk.widget_id, false));
        frame.render_widget(p, area);
        return;
    };

    if props.datasets.is_empty() {
        let p = Paragraph::new("empty Chart").block(titled_block(&chunk.widget_id, false));
        frame.render_widget(p, area);
        return;
    }

    // Own the point buffers for Dataset lifetimes within this draw.
    let owned: Vec<Vec<(f64, f64)>> = props
        .datasets
        .iter()
        .map(|ds| {
            ds.data
                .iter()
                .enumerate()
                .map(|(i, y)| (i as f64, *y))
                .collect()
        })
        .collect();

    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;
    let mut x_max = 1.0_f64;
    for pts in &owned {
        for &(x, y) in pts {
            y_min = y_min.min(y);
            y_max = y_max.max(y);
            x_max = x_max.max(x);
        }
    }
    if !y_min.is_finite() {
        y_min = 0.0;
        y_max = 1.0;
    }
    if (y_max - y_min).abs() < f64::EPSILON {
        y_min -= 1.0;
        y_max += 1.0;
    }
    let pad = (y_max - y_min) * 0.08;
    y_min -= pad;
    y_max += pad;

    let datasets: Vec<Dataset> = props
        .datasets
        .iter()
        .zip(owned.iter())
        .enumerate()
        .map(|(i, (ds, pts))| {
            let color = SERIES_COLORS[i % SERIES_COLORS.len()];
            Dataset::default()
                .name(ds.name.clone())
                .marker(Marker::Braille)
                .graph_type(GraphType::Line)
                .style(Style::default().fg(color))
                .data(pts.as_slice())
        })
        .collect();

    let title = props
        .title
        .clone()
        .unwrap_or_else(|| format!("◈ {}", chunk.widget_id));

    let y_mid = (y_min + y_max) / 2.0;
    let chart = Chart::new(datasets)
        .block(titled_block(title, false))
        .x_axis(
            Axis::default()
                .style(Style::default().fg(Color::DarkGray))
                .bounds([0.0, x_max.max(1.0)])
                .labels(vec![
                    Span::raw("0"),
                    Span::raw(format!("{:.0}", x_max / 2.0)),
                    Span::raw(format!("{:.0}", x_max)),
                ]),
        )
        .y_axis(
            Axis::default()
                .style(Style::default().fg(Color::DarkGray))
                .bounds([y_min, y_max])
                .labels(vec![
                    Span::raw(format!("{y_min:.1}")),
                    Span::raw(format!("{y_mid:.1}")),
                    Span::raw(format!("{y_max:.1}")),
                ]),
        );

    frame.render_widget(chart, area);
}
