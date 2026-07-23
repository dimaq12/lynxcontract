# Battle report — acme-corelab instantiation runs

- RUN[run-1]: 2026-07-20 template@9f3c2e1
- RUN[run-2]: 2026-07-22 template@9f3c2e1

- FINDING[F-001]: class=predicted run=run-1 at=internal/CaptureMapper.kt marker=fixtures/template/CaptureMapper.lynx.kt:3 — log line absent vs reference; matches the declared etalon deviation
- FINDING[F-002]: class=defect run=run-1 at=internal/StartCaptureRoute.kt:12 — retry loop diverges from the declared error routing
- FINDING[F-003]: class=defect run=run-2 at=internal/StartCaptureRoute.kt:12 grouped=F-002 — same divergence reproduced in run 2
