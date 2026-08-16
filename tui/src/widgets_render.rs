use ratatui::layout::{Alignment, Constraint};
use ratatui::style::{Color, Modifier, Style};
use ratatui::symbols::Marker;
use ratatui::text::{Line, Span};
use ratatui::widgets::{
    Axis, Bar, BarChart, BarGroup, Block, Borders, Cell, Chart, Dataset, Gauge, GraphType, List,
    ListItem, ListState, Paragraph, Row, Scrollbar, ScrollbarOrientation, ScrollbarState,
    Sparkline, SparklineBar, Table, TableState, Wrap,
};
use ratatui::Frame;

use crate::chart::{
    category_label, kind_of, pie_slices, point_count, selected_point, series_count, ChartKind,
};
use crate::content_measure::{table_col_maxes, wrap_line_count};
use crate::model::{ChartProps, GaugeProps, ListProps, ParagraphProps, TableProps, TuiChunk};

const SERIES_COLORS: [Color; 6] = [
    Color::Cyan,
    Color::Magenta,
    Color::Yellow,
    Color::Green,
    Color::Blue,
    Color::LightRed,
];

pub struct ChunkRenderOpts {
    /// Idle / DetailScreen Tab focus (cyan).
    pub focused: bool,
    /// Browse / TableInteract yellow hover.
    pub hovered: bool,
    /// TableInteract active.
    pub active: bool,
    pub scroll: u16,
    pub selected_row: Option<usize>,
    pub chart_series: Option<usize>,
    pub chart_index: Option<usize>,
    /// Rows whose detail board is already cached (Table only).
    pub ready_rows: Vec<bool>,
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

#[derive(Clone, Copy)]
enum BorderTone {
    Dim,
    Cyan,
    Yellow,
}

fn border_tone(opts: &ChunkRenderOpts) -> BorderTone {
    if opts.hovered || opts.active {
        BorderTone::Yellow
    } else if opts.focused {
        BorderTone::Cyan
    } else {
        BorderTone::Dim
    }
}

fn titled_block(title: impl Into<String>, tone: BorderTone) -> Block<'static> {
    let title = title.into();
    let (border, title_style) = match tone {
        BorderTone::Yellow => (
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        BorderTone::Cyan => (
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        BorderTone::Dim => (
            Style::default().fg(Color::DarkGray),
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ),
    };
    Block::default()
        .borders(Borders::ALL)
        .border_style(border)
        .title(Span::styled(title, title_style))
}

fn title_mark(opts: &ChunkRenderOpts, base: String) -> String {
    if opts.hovered || opts.active {
        format!("▸ {base}")
    } else if opts.focused {
        format!("▸ {base}")
    } else {
        base
    }
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
            let p = Paragraph::new(msg).block(titled_block(&chunk.widget_id, border_tone(opts)));
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
    let props: ParagraphProps =
        serde_json::from_value(chunk.props.clone()).unwrap_or(ParagraphProps {
            text: chunk.props.to_string(),
            title: Some(chunk.widget_id.clone()),
            style: None,
        });
    let color = style_name_to_color(props.style.as_deref());
    let title = title_mark(
        opts,
        props
            .title
            .clone()
            .unwrap_or_else(|| chunk.widget_id.clone()),
    );
    let mut block = titled_block(title, border_tone(opts));
    if matches!(border_tone(opts), BorderTone::Dim) {
        block = block.border_style(Style::default().fg(color));
    }

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
        let p = Paragraph::new("invalid Table props")
            .block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    };

    let title = title_mark(
        opts,
        props
            .title
            .clone()
            .unwrap_or_else(|| format!("▤ {}", chunk.widget_id)),
    );

    let n_cols = props.headers.len();
    let check_style = Style::default()
        .fg(Color::Green)
        .add_modifier(Modifier::BOLD);
    let header = Row::new(std::iter::once(Cell::from(" ")).chain(
        props.headers.iter().enumerate().map(|(c, h)| {
            let mut style = Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD);
            if props.highlight_column == Some(c) {
                style = style.fg(Color::Cyan);
            }
            Cell::from(align_line(h, col_align(&props, c), style))
        }),
    ))
    .height(1)
    .bottom_margin(0);

    let rows: Vec<Row> = props
        .rows
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let ready = opts.ready_rows.get(i).copied().unwrap_or(false);
            let zebra = if props.zebra && i % 2 == 1 {
                Style::default().fg(Color::Gray)
            } else {
                Style::default().fg(Color::White)
            };
            let mark = if ready {
                Cell::from(Span::styled("✓", check_style))
            } else {
                Cell::from(" ")
            };
            Row::new(std::iter::once(mark).chain((0..n_cols).map(|c| {
                let raw = row.get(c).map(String::as_str).unwrap_or("");
                let mut cell_style = zebra;
                if props.highlight_column == Some(c) {
                    cell_style = cell_style.fg(Color::Cyan).add_modifier(Modifier::BOLD);
                }
                Cell::from(align_line(raw, col_align(&props, c), cell_style))
            })))
            .style(zebra)
        })
        .collect();

    let data_widths = col_constraints(&props.headers, &props.rows, area.width.saturating_sub(3));
    let mut widths = vec![Constraint::Length(2)];
    widths.extend(data_widths);
    let highlight = if opts.active {
        Style::default()
            .bg(Color::Yellow)
            .fg(Color::Black)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().bg(Color::DarkGray).fg(Color::Cyan)
    };
    let spacing = if props.compact { 0 } else { 1 };
    let table = Table::new(rows, widths)
        .header(header)
        .block(titled_block(title, border_tone(opts)))
        .column_spacing(spacing)
        .row_highlight_style(highlight);

    let row_count = props.rows.len();
    let visible = area.height.saturating_sub(3).max(1) as usize;
    let max_off = row_count.saturating_sub(visible);

    let selected = opts.selected_row.filter(|&r| r < row_count);
    let offset = if let Some(sel) = selected {
        let desired = sel.saturating_sub(visible.saturating_sub(1) / 2);
        desired.min(max_off)
    } else {
        (opts.scroll as usize).min(max_off)
    };

    let mut state = TableState::default().with_offset(offset);
    if let Some(sel) = selected {
        state.select(Some(sel));
    } else if opts.focused && row_count > 0 {
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
        let p = Paragraph::new("invalid List props")
            .block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    };
    let title = title_mark(
        opts,
        props
            .title
            .clone()
            .unwrap_or_else(|| format!("• {}", chunk.widget_id)),
    );

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
        .block(titled_block(title, border_tone(opts)))
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
    let selected = props.selected_index.unwrap_or(offset).clamp(
        offset,
        (offset + visible.saturating_sub(1)).min(n.saturating_sub(1)),
    );
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
        let p = Paragraph::new("invalid Gauge props")
            .block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    };
    let ratio = props.ratio.clamp(0.0, 1.0);
    let title = title_mark(
        opts,
        props
            .title
            .clone()
            .unwrap_or_else(|| chunk.widget_id.clone()),
    );
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
        .block(titled_block(title, border_tone(opts)))
        .gauge_style(Style::default().fg(color).bg(Color::Black))
        .ratio(ratio)
        .label(label);
    frame.render_widget(gauge, area);
}

fn looks_numeric(s: &str) -> bool {
    s.trim().replace(',', "").parse::<f64>().is_ok()
}

fn col_align(props: &TableProps, col: usize) -> Alignment {
    if let Some(a) = props
        .align
        .as_ref()
        .and_then(|v| v.get(col))
        .map(|s| s.as_str())
    {
        return match a {
            "right" => Alignment::Right,
            "center" => Alignment::Center,
            _ => Alignment::Left,
        };
    }
    if props.numeric_align {
        let sample = props
            .rows
            .iter()
            .find_map(|r| r.get(col))
            .map(String::as_str);
        if sample.is_some_and(looks_numeric) {
            return Alignment::Right;
        }
    }
    Alignment::Left
}

fn align_line(text: &str, align: Alignment, style: Style) -> Line<'static> {
    Line::from(Span::styled(text.to_string(), style)).alignment(align)
}

fn chart_title(chunk: &TuiChunk, props: &ChartProps, opts: &ChunkRenderOpts) -> String {
    let kind = kind_of(props);
    let base = props
        .title
        .clone()
        .unwrap_or_else(|| format!("◈ {}", chunk.widget_id));
    let mut t = title_mark(opts, base);
    if let (Some(s), Some(i)) = (opts.chart_series, opts.chart_index) {
        if let Some((name, label, value, pct)) = selected_point(props, kind, s, i) {
            t = match pct {
                Some(p) => format!("{t} · {name} · {label}={value:.2} ({:.0}%)", p * 100.0),
                None => format!("{t} · {name} · {label}={value:.2}"),
            };
        }
    }
    t
}

fn render_chart(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    opts: &ChunkRenderOpts,
) {
    let Ok(props) = serde_json::from_value::<ChartProps>(chunk.props.clone()) else {
        let p = Paragraph::new("invalid Chart props")
            .block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    };

    if props.datasets.is_empty() {
        let p =
            Paragraph::new("empty Chart").block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    }

    match kind_of(&props) {
        ChartKind::Bar => render_bar(frame, area, chunk, &props, opts),
        ChartKind::Sparkline => render_sparkline(frame, area, chunk, &props, opts),
        ChartKind::Pie => render_pie(frame, area, chunk, &props, opts),
        ChartKind::Stacked => render_stacked(frame, area, chunk, &props, opts),
        ChartKind::Line => render_line(frame, area, chunk, &props, opts),
    }
}

fn y_bounds(owned: &[Vec<(f64, f64)>]) -> (f64, f64, f64) {
    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;
    let mut x_max = 1.0_f64;
    for pts in owned {
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
    (y_min - pad, y_max + pad, x_max)
}

fn render_line(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    props: &ChartProps,
    opts: &ChunkRenderOpts,
) {
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
    let (y_min, y_max, x_max) = y_bounds(&owned);
    let graph = if kind_of(props) == ChartKind::Bar {
        GraphType::Bar
    } else {
        GraphType::Line
    };
    let mut datasets: Vec<Dataset> = props
        .datasets
        .iter()
        .zip(owned.iter())
        .enumerate()
        .map(|(i, (ds, pts))| {
            let color = SERIES_COLORS[i % SERIES_COLORS.len()];
            Dataset::default()
                .name(ds.name.clone())
                .marker(Marker::Braille)
                .graph_type(graph)
                .style(Style::default().fg(color))
                .data(pts.as_slice())
        })
        .collect();

    let cursor: Vec<(f64, f64)> = if let (Some(s), Some(i)) = (opts.chart_series, opts.chart_index)
    {
        owned
            .get(s)
            .and_then(|pts| pts.get(i).copied())
            .map(|p| vec![p])
            .unwrap_or_default()
    } else {
        vec![]
    };
    if !cursor.is_empty() {
        datasets.push(
            Dataset::default()
                .name(" ")
                .marker(Marker::Dot)
                .graph_type(GraphType::Scatter)
                .style(
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                )
                .data(cursor.as_slice()),
        );
    }

    let title = chart_title(chunk, props, opts);
    let y_mid = (y_min + y_max) / 2.0;
    let x_labels = x_axis_labels(props, x_max);
    let chart = Chart::new(datasets)
        .block(titled_block(title, border_tone(opts)))
        .x_axis(
            Axis::default()
                .style(Style::default().fg(Color::DarkGray))
                .bounds([0.0, x_max.max(1.0)])
                .labels(x_labels),
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

fn x_axis_labels(props: &ChartProps, x_max: f64) -> Vec<Span<'static>> {
    let n = x_max.round() as usize;
    let mid = n / 2;
    vec![
        Span::raw(category_label(props, 0)),
        Span::raw(category_label(props, mid)),
        Span::raw(category_label(props, n)),
    ]
}

fn scale_u64(data: &[f64]) -> Vec<u64> {
    let m = data.iter().copied().fold(0.0_f64, f64::max);
    if m <= 0.0 {
        return vec![0; data.len()];
    }
    data.iter()
        .map(|v| ((v.max(0.0) / m) * 1000.0).round() as u64)
        .collect()
}

fn scale_one(v: f64, max: f64) -> u64 {
    if max <= 0.0 {
        0
    } else {
        ((v.max(0.0) / max) * 1000.0).round() as u64
    }
}

fn global_max(props: &ChartProps) -> f64 {
    props
        .datasets
        .iter()
        .flat_map(|d| d.data.iter().copied())
        .fold(0.0_f64, f64::max)
}

fn render_bar(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    props: &ChartProps,
    opts: &ChunkRenderOpts,
) {
    let n_series = series_count(props, ChartKind::Bar);
    let n_pts = point_count(props, ChartKind::Bar);
    if n_pts == 0 {
        let p =
            Paragraph::new("empty Chart").block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    }
    let title = chart_title(chunk, props, opts);
    let labels: Vec<String> = (0..n_pts).map(|i| category_label(props, i)).collect();
    let max = global_max(props);

    if n_series == 1 {
        let raw = &props.datasets[0].data;
        let bars: Vec<Bar> = labels
            .iter()
            .enumerate()
            .map(|(i, lab)| {
                let v = scale_one(raw.get(i).copied().unwrap_or(0.0), max);
                let color = if opts.chart_index == Some(i) {
                    Color::Yellow
                } else {
                    SERIES_COLORS[0]
                };
                Bar::default()
                    .value(v)
                    .label(Line::from(lab.clone()))
                    .style(Style::default().fg(color))
            })
            .collect();
        let chart = BarChart::default()
            .block(titled_block(title, border_tone(opts)))
            .bar_width(3)
            .bar_gap(1)
            .value_style(Style::default().fg(Color::White))
            .label_style(Style::default().fg(Color::DarkGray))
            .data(BarGroup::default().bars(&bars));
        frame.render_widget(chart, area);
        return;
    }

    let mut chart = BarChart::default()
        .block(titled_block(title, border_tone(opts)))
        .bar_width(2)
        .bar_gap(1)
        .group_gap(2)
        .label_style(Style::default().fg(Color::DarkGray));
    for i in 0..n_pts {
        let bars: Vec<Bar> = props
            .datasets
            .iter()
            .enumerate()
            .map(|(s, ds)| {
                let v = scale_one(ds.data.get(i).copied().unwrap_or(0.0), max);
                let color = if opts.chart_index == Some(i) && opts.chart_series == Some(s) {
                    Color::Yellow
                } else {
                    SERIES_COLORS[s % SERIES_COLORS.len()]
                };
                Bar::default().value(v).style(Style::default().fg(color))
            })
            .collect();
        chart = chart.data(
            BarGroup::default()
                .label(Line::from(labels[i].clone()))
                .bars(&bars),
        );
    }
    frame.render_widget(chart, area);
}

fn render_sparkline(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    props: &ChartProps,
    opts: &ChunkRenderOpts,
) {
    let data = props
        .datasets
        .first()
        .map(|d| d.data.as_slice())
        .unwrap_or(&[]);
    if data.is_empty() {
        let p =
            Paragraph::new("empty Chart").block(titled_block(&chunk.widget_id, border_tone(opts)));
        frame.render_widget(p, area);
        return;
    }
    let scaled = scale_u64(data);
    let bars: Vec<SparklineBar> = scaled
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let mut b = SparklineBar::from(*v);
            if opts.chart_index == Some(i) {
                b = SparklineBar::from(*v).style(Some(
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ));
            }
            b
        })
        .collect();
    let spark = Sparkline::default()
        .block(titled_block(
            chart_title(chunk, props, opts),
            border_tone(opts),
        ))
        .data(bars)
        .style(Style::default().fg(SERIES_COLORS[0]));
    frame.render_widget(spark, area);
}

fn render_pie(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    props: &ChartProps,
    opts: &ChunkRenderOpts,
) {
    let slices = pie_slices(props);
    let sum: f64 = slices.iter().map(|s| s.value).sum();
    let title = chart_title(chunk, props, opts);
    let block = titled_block(title, border_tone(opts));
    if slices.is_empty() || sum <= 0.0 {
        frame.render_widget(Paragraph::new("empty Chart").block(block), area);
        return;
    }

    let inner_h = area.height.saturating_sub(2);
    if inner_h < 8 {
        render_pie_bar(frame, area, &slices, sum, opts, block);
        return;
    }

    frame.render_widget(block, area);
    let inner = ratatui::layout::Rect {
        x: area.x.saturating_add(1),
        y: area.y.saturating_add(1),
        width: area.width.saturating_sub(2),
        height: area.height.saturating_sub(2),
    };
    if inner.width < 4 || inner.height < 3 {
        return;
    }
    let legend_w = inner
        .width
        .saturating_div(2)
        .max(12)
        .min(inner.width.saturating_sub(8));
    let pie_w = inner.width.saturating_sub(legend_w);
    let pie_area = ratatui::layout::Rect {
        x: inner.x,
        y: inner.y,
        width: pie_w,
        height: inner.height,
    };
    let legend_area = ratatui::layout::Rect {
        x: inner.x.saturating_add(pie_w),
        y: inner.y,
        width: legend_w,
        height: inner.height,
    };
    paint_pie_disk(frame, pie_area, &slices, sum, opts.chart_index);
    paint_pie_legend(frame, legend_area, &slices, sum, opts.chart_index);
}

fn render_pie_bar(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    slices: &[crate::chart::ChartSlice],
    sum: f64,
    opts: &ChunkRenderOpts,
    block: Block<'static>,
) {
    frame.render_widget(block, area);
    let inner = ratatui::layout::Rect {
        x: area.x.saturating_add(1),
        y: area.y.saturating_add(1),
        width: area.width.saturating_sub(2),
        height: area.height.saturating_sub(2),
    };
    if inner.width == 0 || inner.height == 0 {
        return;
    }
    let buf = frame.buffer_mut();
    let mut x = inner.x;
    let bar_y = inner.y;
    for (i, sl) in slices.iter().enumerate() {
        let w = ((sl.value / sum) * f64::from(inner.width)).round() as u16;
        let w = w
            .max(if sl.value > 0.0 { 1 } else { 0 })
            .min(inner.x + inner.width - x);
        let color = if opts.chart_index == Some(i) {
            Color::Yellow
        } else {
            SERIES_COLORS[i % SERIES_COLORS.len()]
        };
        for dx in 0..w {
            if let Some(cell) = buf.cell_mut((x + dx, bar_y)) {
                cell.set_char('█');
                cell.set_fg(color);
            }
        }
        x = x.saturating_add(w);
        if x >= inner.x + inner.width {
            break;
        }
    }
    let legend_y = inner
        .y
        .saturating_add(2)
        .min(inner.y + inner.height.saturating_sub(1));
    paint_pie_legend(
        frame,
        ratatui::layout::Rect {
            x: inner.x,
            y: legend_y,
            width: inner.width,
            height: inner.height.saturating_sub(2),
        },
        slices,
        sum,
        opts.chart_index,
    );
}

fn paint_pie_disk(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    slices: &[crate::chart::ChartSlice],
    sum: f64,
    selected: Option<usize>,
) {
    let buf = frame.buffer_mut();
    let cx = f64::from(area.x) + f64::from(area.width) / 2.0;
    let cy = f64::from(area.y) + f64::from(area.height) / 2.0;
    let rx = f64::from(area.width) / 2.0 - 0.5;
    let ry = f64::from(area.height) / 2.0 - 0.5;
    if rx <= 0.0 || ry <= 0.0 {
        return;
    }
    let mut thresholds = Vec::new();
    let mut acc = 0.0;
    for sl in slices {
        acc += sl.value / sum;
        thresholds.push(acc);
    }
    for row in 0..area.height {
        for col in 0..area.width {
            let x = f64::from(area.x + col) + 0.5;
            let y = f64::from(area.y + row) + 0.5;
            let dx = (x - cx) / rx;
            let dy = (y - cy) / ry;
            if dx * dx + dy * dy > 1.0 {
                continue;
            }
            let mut angle = dy.atan2(dx);
            if angle < 0.0 {
                angle += std::f64::consts::TAU;
            }
            let t = angle / std::f64::consts::TAU;
            let idx = thresholds
                .iter()
                .position(|th| t <= *th)
                .unwrap_or(slices.len().saturating_sub(1));
            let color = if selected == Some(idx) {
                Color::Yellow
            } else {
                SERIES_COLORS[idx % SERIES_COLORS.len()]
            };
            if let Some(cell) = buf.cell_mut((area.x + col, area.y + row)) {
                cell.set_char('●');
                cell.set_fg(color);
            }
        }
    }
}

fn paint_pie_legend(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    slices: &[crate::chart::ChartSlice],
    sum: f64,
    selected: Option<usize>,
) {
    let lines: Vec<Line> = slices
        .iter()
        .enumerate()
        .map(|(i, sl)| {
            let pct = sl.value / sum * 100.0;
            let mark = if selected == Some(i) { "▸" } else { " " };
            let color = if selected == Some(i) {
                Color::Yellow
            } else {
                SERIES_COLORS[i % SERIES_COLORS.len()]
            };
            Line::from(Span::styled(
                format!("{mark} {}  {:.1}  ({pct:.0}%)", sl.name, sl.value),
                Style::default().fg(color),
            ))
        })
        .collect();
    frame.render_widget(Paragraph::new(lines), area);
}

fn render_stacked(
    frame: &mut Frame,
    area: ratatui::layout::Rect,
    chunk: &TuiChunk,
    props: &ChartProps,
    opts: &ChunkRenderOpts,
) {
    let n_pts = point_count(props, ChartKind::Stacked);
    let n_series = series_count(props, ChartKind::Stacked);
    let title = chart_title(chunk, props, opts);
    let block = titled_block(title, border_tone(opts));
    if n_pts == 0 {
        frame.render_widget(Paragraph::new("empty Chart").block(block), area);
        return;
    }
    frame.render_widget(block, area);
    let inner = ratatui::layout::Rect {
        x: area.x.saturating_add(1),
        y: area.y.saturating_add(1),
        width: area.width.saturating_sub(2),
        height: area.height.saturating_sub(3),
    };
    if inner.width == 0 || inner.height == 0 {
        return;
    }
    let mut stacks = vec![0.0_f64; n_pts];
    for ds in &props.datasets {
        for (i, v) in ds.data.iter().enumerate().take(n_pts) {
            stacks[i] += v.max(0.0);
        }
    }
    let max_stack = stacks.iter().copied().fold(0.0_f64, f64::max).max(1.0);
    let col_w = (inner.width / n_pts as u16).max(1);
    let buf = frame.buffer_mut();
    for i in 0..n_pts {
        let x0 = inner.x + i as u16 * col_w;
        let mut y_top = inner.y + inner.height;
        for s in 0..n_series {
            let v = props
                .datasets
                .get(s)
                .and_then(|d| d.data.get(i))
                .copied()
                .unwrap_or(0.0)
                .max(0.0);
            let h = ((v / max_stack) * f64::from(inner.height)).round() as u16;
            if h == 0 && v > 0.0 {
                continue;
            }
            let selected = opts.chart_index == Some(i) && opts.chart_series == Some(s);
            let color = if selected {
                Color::Yellow
            } else {
                SERIES_COLORS[s % SERIES_COLORS.len()]
            };
            for _ in 0..h {
                if y_top <= inner.y {
                    break;
                }
                y_top -= 1;
                for dx in 0..col_w.saturating_sub(1).max(1) {
                    if let Some(cell) = buf.cell_mut((x0 + dx, y_top)) {
                        cell.set_char('█');
                        cell.set_fg(color);
                    }
                }
            }
        }
        let lab = category_label(props, i);
        let ly = area.y + area.height.saturating_sub(2);
        for (k, ch) in lab
            .chars()
            .take(col_w.saturating_sub(1) as usize)
            .enumerate()
        {
            if let Some(cell) = buf.cell_mut((x0 + k as u16, ly)) {
                cell.set_char(ch);
                cell.set_fg(if opts.chart_index == Some(i) {
                    Color::Yellow
                } else {
                    Color::DarkGray
                });
            }
        }
    }
}
