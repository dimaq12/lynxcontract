# acme-telemetry module graph (root map)

TARGET: n/a
REALIZATION: n/a

```
//@graph: acme-telemetry
//@  files:
//@    - internal/StartCaptureRoute.kt   realizes: [StartCaptureRoute.lynx.kt#StartCaptureRoute.handle]
//@    - internal/CaptureMapper.kt      realizes: [CaptureMapper.lynx.kt#CaptureMapper.toEvent]
//@  depends:
//@    internal/StartCaptureRoute.kt: [internal/CaptureMapper.kt]
//@    internal/CaptureMapper.kt: []
//@  vanilla: "Standard adapter module: internal/ routes + external/ messages."
```
