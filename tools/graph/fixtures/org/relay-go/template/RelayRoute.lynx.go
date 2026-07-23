// TARGET: internal/relay_route.go
// REALIZATION: generate

//@module:
//@  layer: core
//@  package: acme/relay
//@  depends: [acme/messaging]
//@
//@messaging: RelayRoute
//@  consumes:
//@    topic: telemetry.event.capture-started
//@    as: CaptureStarted
//@    format: json
//@    group: relay-go
//@  produces:
//@    - topic: relay.event.reading-relayed
//@      as: ReadingRelayed
//@      format: json
//@  ordering: per-key
//@  idempotent: true
//@
//@contract: RelayRoute.Handle
//@  lang: go
//@  signature: func Handle(evt CaptureStarted) ReadingRelayed
//@  post: result.ReadingId != ""
//@  assigns: []
//@  realizedBy: [internal/relay_route.go]
package template
