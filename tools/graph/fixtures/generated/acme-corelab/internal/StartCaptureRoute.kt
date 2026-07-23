package com.acme.corelab.telemetry.internal

import com.acme.telemetry.rest.TelemetryApi

// TEMPLATE-GAP: envelope unwrap helper absent from the template; inlined here
class StartCaptureRoute(private val api: TelemetryApi) {
    fun handle(command: StartCapture): CaptureStarted {
        val response = api.createCapture(command.toCoreRequest())
        return CaptureMapper().toEvent(response)
    }

    fun retryBackoff(attempt: Int): Long = attempt * 250L
}

// wire-true (§18.1 quirk): the produced record key keeps the reference misspelling
private const val RECORD_KEY = "captur-startd"
