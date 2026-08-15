//! Round spinner + cycling status phrases for `/details` wait.

pub const PHRASES: &[&str] = &[
    "fetching data",
    "preparing response",
    "gathering context",
    "enriching detail",
    "talking to agent",
    "composing board",
];

const RING: [(usize, usize); 8] = [
    (6, 0),
    (10, 1),
    (12, 2),
    (10, 3),
    (6, 4),
    (2, 3),
    (0, 2),
    (2, 1),
];

const COLS: usize = 13;
const ROWS: usize = 5;

pub fn spinner_frame(elapsed_ms: u128) -> usize {
    ((elapsed_ms / 90) as usize) % RING.len()
}

pub fn status_phrase(elapsed_ms: u128) -> &'static str {
    PHRASES[((elapsed_ms / 1600) as usize) % PHRASES.len()]
}

/// 5-line circle with a moving head.
pub fn ring_lines(frame: usize) -> Vec<String> {
    let mut grid = vec![vec![' '; COLS]; ROWS];
    let head = frame % RING.len();
    for (i, &(x, y)) in RING.iter().enumerate() {
        grid[y][x] = if i == head { '●' } else { '·' };
    }
    grid.into_iter().map(|row| row.into_iter().collect()).collect()
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
        assert_eq!(lines.len(), 5);
        let heads: usize = lines.iter().map(|l| l.chars().filter(|c| *c == '●').count()).sum();
        assert_eq!(heads, 1);
    }
}
