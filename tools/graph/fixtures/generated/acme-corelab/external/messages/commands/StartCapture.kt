package com.acme.corelab.telemetry.external.messages.commands

data class StartCapture(val id: String, val deviceId: String, val value: Long)
