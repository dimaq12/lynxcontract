// TARGET: internal/CaptureMapper.kt
// REALIZATION: copy-verbatim etalon/CaptureMapper.kt
# etalon deviation: etalon/CaptureMapper.kt:12 — reference logs the raw payload — canon drops the log line

//@contract: CaptureMapper.toEvent
//@  lang: kotlin
//@  signature: fun toEvent(response: RawCapture): CaptureStarted
//@  post: result.captureId == response.id
//@  assigns: []
//@  realizedBy: [internal/CaptureMapper.kt]
//@
//@contract: CaptureMapper.toFailedEvent
//@  lang: kotlin
//@  signature: fun toFailedEvent(error: CoreError): CaptureStartFailed
//@  post: result.reason != null
//@  assigns: []
//@  realizedBy: [internal/CaptureMapper.kt]
class CaptureMapperStub
