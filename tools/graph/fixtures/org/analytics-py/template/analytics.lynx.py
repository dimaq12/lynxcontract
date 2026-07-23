# TARGET: analytics/report.py
# REALIZATION: generate

#@module:
#@  layer: analytics
#@  package: acme.analytics
#@
#@messaging: AnalyticsSink
#@  consumes:
#@    topic: relay.event.reading-relayed
#@    as: ReadingRelayed
#@    format: json
#@    group: analytics-py
#@
#@contract: AnalyticsSink.ingest
#@  lang: python
#@  signature: def ingest(event: ReadingRelayed) -> None
#@  pre: event.reading_id != ""
#@  post: event persisted exactly once
#@  assigns: [store]
#@  realizedBy: [analytics/report.py]
