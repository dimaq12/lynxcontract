# Instantiation manifest — acme-telemetry @ corelab

## Fills

| Token | Value | Status |
|---|---|---|
| {{Provider}} | corelab | confirmed |
| {{Domain}} | telemetry | confirmed |

## Instances

<!-- StopCapture is deliberately neither generated nor BLOCKED: it trips §20.8-8 (output-target-completion) as a designed lint fixture. -->

- INSTANCE[{{Command}}]: StartCapture, StopCapture, ResetCapture

## Blocked targets

- BLOCKED[external/messages/commands/ResetCapture.kt]: upstream reset schema unpinned (PIN corelab-openapi lacks reset surface)

## Scope reductions

- SCOPE-REDUCED[StartCaptureRoute.produces-when.PermanentException]: failed-event path covered by shared envelope contract-tests
