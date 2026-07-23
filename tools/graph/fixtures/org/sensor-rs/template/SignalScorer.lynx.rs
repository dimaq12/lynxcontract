// TARGET: src/signal_scorer.rs
// REALIZATION: generate

//@module:
//@  layer: core
//@  package: acme::sensor
//@
//@messaging: SignalScorer
//@  consumes:
//@    topic: relay.event.reading-relayed
//@    as: ReadingRelayed
//@    format: json
//@    group: sensor-rs
//@  produces:
//@    - topic: sensor.event.signal-scored
//@      as: SignalScored
//@      format: json
//@  ordering: per-key
//@  idempotent: true
//@
//@contract: SignalScorer.score
//@  lang: rust
//@  signature: fn score(reading: ReadingRelayed) -> SignalScored
//@  pre: reading.value > 0
//@  post: result.score >= 0.0 && result.score <= 1.0
//@  assigns: []
//@  realizedBy: [src/signal_scorer.rs]
