// TEMPLATE-GAP: score normalization helper absent from the rust template; inlined clamp
pub fn score(reading: ReadingRelayed) -> SignalScored {
    SignalScored { reading_id: entry.reading_id, score: clamp01(reading.value as f64 / 10_000.0) }
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}
