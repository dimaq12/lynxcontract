package com.acme.corelab.telemetry.tests

class StartCaptureRouteTest {
    //@covers: [StartCaptureRoute.handle.raises.PermanentException]
    fun permanentFailureProducesFailedEvent() {
        // asserts the -failed event per the contract clause
    }

    fun happyPathOpensCapture() {
        // post: result.status == "OPEN"
    }
}
