// TARGET: internal/StartCaptureRoute.kt
// REALIZATION: generate

//@module:
//@  layer: integration
//@  package: com.acme.{{Provider}}.{{Domain}}
//@  depends: [com.acme.telemetry.rest.*, com.acme.messaging.commons.*]
//@  restrictions: [com.acme.notify.*]
//@
//@realizes: [shared/envelope#EnvelopeRoute]
//@
//@messaging: StartCaptureRoute
//@  consumes:
//@    topic: corelab.telemetry.command.open-capture
//@    as: StartCapture
//@    format: envelope-json
//@    group: corelab-telemetry-adapter-{{Region}}
//@    key: deviceId
//@  produces:
//@    - topic: telemetry.event.capture-started
//@      as: CaptureStarted
//@      format: envelope-json
//@    - topic: telemetry.event.capture-start-failed
//@      as: CaptureStartFailed
//@      when: raises PermanentException
//@  ordering: per-key
//@  idempotent: false                # actuation-adjacent: no auto-retry
//@  errors:
//@    TransientException: retry-in-process
//@    RetryableException: retry-topic
//@    PermanentException: failed-event + dlq
//@  dlq: corelab.telemetry.dlq
//@
//@flow: StartCaptureRoute.flow
//@  from: topic corelab.telemetry.command.open-capture
//@  through:
//@    - UnwrapEnvelope
//@    - mapToCoreRequest
//@  to: topic telemetry.event.capture-started
//@  privacy: pii
//@
//@contract: telemetry.status
//@  intent: published capture status vocabulary — compatibility surface (§19.1)
//@  CaptureStatus:
//@    frozen: true
//@    closed: true
//@    compat: "downstream dashboards read these literals"
//@    values: [OPEN, COMPLETE, "ON HOLD"]
//@
//@contract: StartCaptureRoute.handle
//@  lang: kotlin
//@  signature: fun handle(command: StartCapture): CaptureStarted
//@  pre: command.id != null && command.value > 0
//@  post: result.captureId != null && result.status == "OPEN"
//@  assigns: []
//@  calls: [telemetryApi.createCapture]
//@  raises:
//@    PermanentException: command.deviceId unknown to the provider
//@    RetryableException: telemetryApi unavailable
//@  realizedBy: [internal/StartCaptureRoute.kt]
class StartCaptureRoute
