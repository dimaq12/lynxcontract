package com.acme.corelab.telemetry.internal

class CaptureMapper {
    fun toEvent(response: RawCapture): CaptureStarted =
        CaptureStarted(captureId = response.id, status = "OPEN")
}
