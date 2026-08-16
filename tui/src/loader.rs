//! Compact circular spinner + cycling status phrases while `/details` or `/prompt` is in flight.

use std::sync::OnceLock;

pub const PHRASES: &[&str] = &[
    "fetching data",
    "preparing response",
    "gathering context",
    "enriching detail",
    "talking to agent",
    "composing board",
];

/// Glyph grid; cell aspect is ~1:2, so cols ≈ 2× rows for a visual circle.
pub const RING_COLS: usize = 11;
pub const RING_ROWS: usize = 6;

const ASPECT: f64 = 2.0;
const RING_THICK: f64 = 0.95;

pub fn spinner_frame(elapsed_ms: u128) -> usize {
    let n = ring_path().len().max(1);
    ((elapsed_ms / 70) as usize) % n
}

pub fn status_phrase(elapsed_ms: u128) -> &'static str {
    PHRASES[((elapsed_ms / 1600) as usize) % PHRASES.len()]
}

fn ring_path() -> &'static [(usize, usize)] {
    static PATH: OnceLock<Vec<(usize, usize)>> = OnceLock::new();
    PATH.get_or_init(build_ring_path).as_slice()
}

fn build_ring_path() -> Vec<(usize, usize)> {
    let cx = RING_COLS as f64 / 2.0;
    let cy = RING_ROWS as f64 / 2.0;
    let r_x = cx - 0.55;
    let r_y = cy * ASPECT - 0.55;
    let r = r_x.min(r_y);

    let mut cells: Vec<(usize, usize, f64)> = Vec::new();
    for y in 0..RING_ROWS {
        for x in 0..RING_COLS {
            let vx = (x as f64 + 0.5) - cx;
            let vy = ((y as f64 + 0.5) - cy) * ASPECT;
            let d = (vx * vx + vy * vy).sqrt();
            if (d - r).abs() <= RING_THICK {
                cells.push((x, y, vy.atan2(vx)));
            }
        }
    }
    cells.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));
    cells.into_iter().map(|(x, y, _)| (x, y)).collect()
}

/// Dense aspect-corrected circle with a moving head.
pub fn ring_lines(frame: usize) -> Vec<String> {
    let path = ring_path();
    let n = path.len().max(1);
    let head = frame % n;
    let mut grid = vec![vec![' '; RING_COLS]; RING_ROWS];
    for (i, &(x, y)) in path.iter().enumerate() {
        let dist = (i + n - head) % n;
        grid[y][x] = if dist == 0 {
            '●'
        } else if dist <= 2 {
            '•'
        } else {
            '○'
        };
    }
    grid.into_iter()
        .map(|row| row.into_iter().collect())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phrase_cycles() {
        assert_eq!(status_phrase(0), "fetching data");
        assert_eq!(status_phrase(1600), "preparing response");
    }

    #[test]
    fn ring_has_one_head() {
        let lines = ring_lines(0);
        assert_eq!(lines.len(), RING_ROWS);
        assert!(lines.iter().all(|l| l.chars().count() == RING_COLS));
        let heads: usize = lines
            .iter()
            .map(|l| l.chars().filter(|c| *c == '●').count())
            .sum();
        assert_eq!(heads, 1);
        let dots: usize = lines
            .iter()
            .map(|l| l.chars().filter(|c| !c.is_whitespace()).count())
            .sum();
        assert!(dots >= 16, "ring should be dense, got {dots} cells");
    }

    #[test]
    fn ring_is_aspect_circle() {
        let path = ring_path();
        assert!(!path.is_empty());
        let xs: Vec<usize> = path.iter().map(|(x, _)| *x).collect();
        let ys: Vec<usize> = path.iter().map(|(_, y)| *y).collect();
        let w = xs.iter().max().unwrap() - xs.iter().min().unwrap() + 1;
        let h = ys.iter().max().unwrap() - ys.iter().min().unwrap() + 1;
        let ratio = w as f64 / h as f64;
        assert!(
            (1.6..=2.4).contains(&ratio),
            "visual circle needs ~2:1 cells, got {w}x{h} ratio={ratio:.2}"
        );
        assert!(path.len() >= 16);
    }

    #[test]
    fn ring_ascii_preview() {
        for line in ring_lines(0) {
            assert_eq!(line.chars().count(), RING_COLS);
        }
        assert!(ring_path().len() >= 16);
    }
}
