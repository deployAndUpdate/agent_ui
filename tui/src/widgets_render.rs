use ratatui::layout::Constraint;
use ratatui::style::{Color, Modifier, Style};
use ratatui::symbols::Marker;
use ratatui::text::{Line, Span};
use ratatui::widgets::{
    Axis, Block, Borders, Cell, Chart, Dataset, Gauge, GraphType, List, ListItem, ListState,
    Paragraph, Row, Scrollbar, ScrollbarOrientation, ScrollbarState, Table, TableState, Wrap,
};
use ratatui::Frame;

use crate::content_measure::{table_col_maxes, wrap_line_count};
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

pub struct ChunkRenderOpts {
    pub focused: bool,
    pub scroll: u16,
}

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
    let title_style = if focused {
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
            .fg(Color::White)
            .add_modifier(Modifier::BOLD)
    };
    Block::default()
        .borders(Borders::ALL)
        .border_style(border)
        .title(Span::styled(title, title_style))
}

pub fn render_chunk(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    match chunk.widget_type.as_str() {
        "Paragraph" => render_paragraph(frame, area, chunk, opts),
        "Table" => render_table(frame, area, chunk, opts),
        "List" => render_list(frame, area, chunk, opts),
        "Gauge" => render_gauge(frame, area, chunk, opts),
        "Chart" => render_chart(frame, area, chunk, opts),
        other => {
            let msg = format!("unknown type: {other}");
            let p = Paragraph::new(msg).block(titled_block(&chunk.widget_id, opts.focused));
            frame.render_widget(p, area);
        }
    }
}

fn render_paragraph(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    let props: ParagraphProps = serde_json::from_value(chunk.props.clone()).unwrap_or(
        ParagraphProps {
            text: chunk.props.to_string(),
            title: Some(chunk.widget_id.clone()),
            style: None,
        },
    );
    let color = style_name_to_color(props.style.as_deref());
    let title = props
        .title
        .clone()
        .unwrap_or_else(|| chunk.widget_id.clone());
    let title = if opts.focused {
        format!("▸ {title}")
    } else {
        title
    };
    let block = titled_block(title, opts.focused).border_style(Style::default().fg(color));

    let inner_w = area.width.saturating_sub(2).max(1);
    let inner_h = area.height.saturating_sub(2).max(1);
    let total_lines = wrap_line_count(&props.text, inner_w);
    let max_scroll = total_lines.saturating_sub(inner_h);
    let scroll = opts.scroll.min(max_scroll);

    let para = Paragraph::new(props.text)
        .style(Style::default().fg(color))
        .wrap(Wrap { trim: true })
        .scroll((scroll, 0))
        .block(block);
    frame.render_widget(para, area);

    if max_scroll > 0 && area.width > 3 {
        let mut sb_state = ScrollbarState::new(total_lines as usize).position(scroll as usize);
        frame.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .begin_symbol(Some("↑"))
                .end_symbol(Some("↓")),
            area,
            &mut sb_state,
        );
    }
}

fn col_constraints(headers: &[String], rows: &[Vec<String>], total_width: u16) -> Vec<Constraint> {
    let maxes = table_col_maxes(headers, rows);
    let n = maxes.len().max(1) as u16;
    let spacing = n.saturating_sub(1);
    let usable = total_width.saturating_sub(2).saturating_sub(spacing).max(n);
    let sum: u16 = maxes.iter().sum::<u16>().max(1);
    maxes
        .iter()
        .map(|&m| {
            // Prefer content width but share remaining space via Fill-like ratio.
            let share = ((u32::from(m) * u32::from(usable)) / u32::from(sum)) as u16;
            let w = share.max(m.min(usable / n).max(3)).min(usable);
            Constraint::Length(w)
        })
        .collect()
}

fn render_table(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    let Ok(props) = serde_json::from_value::<TableProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Table props").block(titled_block(&chunk.widget_id, opts.focused));
        frame.render_widget(p, area);
        return;
    };

    let title = if opts.focused {
        format!("▸ ▤ {}", chunk.widget_id)
    } else {
        format!("▤ {}", chunk.widget_id)
    };

    let header = Row::new(props.headers.iter().map(|h| {
        Cell::from(Span::styled(
            h.clone(),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ))
    }))
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

    let widths = col_constraints(&props.headers, &props.rows, area.width);
    let table = Table::new(rows, widths)
        .header(header)
        .block(titled_block(title, opts.focused))
        .column_spacing(1)
        .row_highlight_style(Style::default().bg(Color::DarkGray).fg(Color::Cyan));

    let row_count = props.rows.len();
    let visible = area.height.saturating_sub(3).max(1) as usize; // borders + header
    let max_off = row_count.saturating_sub(visible);
    let offset = (opts.scroll as usize).min(max_off);
    let mut state = TableState::default().with_offset(offset);
    if opts.focused && row_count > 0 {
        state.select(Some(offset.min(row_count - 1)));
    }
    frame.render_stateful_widget(table, area, &mut state);

    if max_off > 0 {
        let mut sb_state = ScrollbarState::new(row_count).position(offset);
        frame.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .begin_symbol(Some("↑"))
                .end_symbol(Some("↓")),
            area,
            &mut sb_state,
        );
    }
}

fn render_list(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    let Ok(props) = serde_json::from_value::<ListProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid List props").block(titled_block(&chunk.widget_id, opts.focused));
        frame.render_widget(p, area);
        return;
    };
    let title = props
        .title
        .clone()
        .unwrap_or_else(|| format!("• {}", chunk.widget_id));
    let title = if opts.focused {
        format!("▸ {title}")
    } else {
        title
    };

    let items: Vec<ListItem> = props
        .items
        .iter()
        .map(|text| {
            ListItem::new(Line::from(Span::styled(
                format!("  {text}"),
                Style::default().fg(Color::Gray),
            )))
        })
        .collect();

    let list = List::new(items)
        .block(titled_block(title, opts.focused))
        .highlight_style(
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▸ ");

    let n = props.items.len();
    let visible = area.height.saturating_sub(2).max(1) as usize;
    let max_off = n.saturating_sub(visible);
    let offset = (opts.scroll as usize).min(max_off);
    let selected = props
        .selected_index
        .unwrap_or(offset)
        .clamp(offset, (offset + visible.saturating_sub(1)).min(n.saturating_sub(1)));
    let mut state = ListState::default()
        .with_offset(offset)
        .with_selected(if n > 0 { Some(selected) } else { None });
    frame.render_stateful_widget(list, area, &mut state);

    if max_off > 0 {
        let mut sb_state = ScrollbarState::new(n).position(offset);
        frame.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .begin_symbol(Some("↑"))
                .end_symbol(Some("↓")),
            area,
            &mut sb_state,
        );
    }
}

fn render_gauge(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    let Ok(props) = serde_json::from_value::<GaugeProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Gauge props").block(titled_block(&chunk.widget_id, opts.focused));
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
        .block(titled_block(title, opts.focused))
        .gauge_style(Style::default().fg(color).bg(Color::Black))
        .ratio(ratio)
        .label(label);
    frame.render_widget(gauge, area);
}

fn render_chart(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    let Ok(props) = serde_json::from_value::<ChartProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Chart props").block(titled_block(&chunk.widget_id, opts.focused));
        frame.render_widget(p, area);
        return;
    };

    if props.datasets.is_empty() {
        let p = Paragraph::new("empty Chart").block(titled_block(&chunk.widget_id, opts.focused));
        frame.render_widget(p, area);
        return;
    }

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
        .block(titled_block(title, opts.focused))
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
