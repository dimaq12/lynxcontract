// TARGET: internal/NotifyRoute.kt
// REALIZATION: generate

//@module:
//@  layer: core
//@  package: com.acme.notify
//@  depends: [com.acme.corelab.telemetry.*, com.acme.messaging.commons.*]
//@
//@messaging: NotifyRoute
//@  consumes:
//@    topic: telemetry.event.capture-started
//@    as: CaptureStarted
//@    format: envelope-json
//@    group: notify-service
//@  produces:
//@    - topic: notify.event.notification-sent
//@      as: NotificationSent
//@      format: envelope-json
//@  ordering: none
//@  idempotent: true
//@
//@flow: NotifyRoute.flow
//@  from: topic telemetry.event.capture-started
//@  through:
//@    - mapToNotification
//@  to: topic notify.event.notification-sent
//@  privacy: internal
//@
//@contract: NotifyRoute.handle
//@  lang: kotlin
//@  signature: fun handle(event: CaptureStarted): NotificationSent
//@  post: result.channel != null
//@  assigns: []
class NotifyRoute

// NOTE: contract-only module by design — the org corpus exercises the hologram
// (shared topics, ownership, layer edges) without a generated tree here.
