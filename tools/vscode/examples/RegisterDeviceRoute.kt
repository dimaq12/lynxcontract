// Manual smoke-test fixture: the §18.5 worked example from the spec.
// Open this file with the extension running — expect highlighting, hover on keys,
// completion after `//@  `, outline symbols, folding, and one deliberate lint
// below (see `idempotent`).
package com.acme.corelab.devices

//@module:
//@  layer: integration
//@  package: com.acme.corelab.devices
//@  depends: [com.acme.corelab.devices.external.messages.*, com.acme.devices.rest.*, com.acme.messaging.commons.*]
//@  restrictions: [com.acme.core.internal.*]
//@  gradleModule: :integration-corelab
//@  doc: "Anti-corruption layer for corelab devices (error-segregation ADR)."
//@
//@messaging: RegisterDeviceRoute
//@  consumes:
//@    topic: corelab.devices.command.register-device
//@    as: RegisterDevice
//@    format: envelope-json
//@    group: corelab-devices-adapter
//@    key: deviceId
//@  produces:
//@    - topic: devices.event.device-registered
//@      as: DeviceRegistered
//@      format: envelope-json
//@    - topic: devices.event.device-open-failed
//@      as: DeviceOpenFailed
//@      when: raises PermanentException
//@  ordering: per-key
//@  idempotent: false                     # deliberate variation on §18.5 to trigger lynx.nonidempotent-retry (§13.3): combines idempotent:false with retry-topic; §18.5 itself routes RetryableException to failed-event
//@  errors:
//@    TransientException: retry-in-process
//@    RetryableException: retry-topic
//@    PermanentException: failed-event + dlq
//@  dlq: corelab.devices.dlq
//@  headers: [acme-correlation-id, acme-device-identifier]
//@
//@flow:
//@  from: topic corelab.devices.command.register-device
//@  through:
//@    - UnwrapEnvelopeProcessor
//@    - mapToCoreRequest
//@    - rest POST devices-api /internal/v1/devices
//@    - mapToDeviceRegistered
//@  to: topic devices.event.device-registered
//@  privacy: pii
//@
//@contract: RegisterDeviceRoute.handle
//@  lang: kotlin
//@  signature: fun handle(command: RegisterDevice): DeviceRegistered
//@  pre: command.id != null && command.deviceId != null
//@  post: result.deviceId != null && result.status == "OPEN"
//@  assigns: []
//@  calls: [devicesApi.createDevice]
//@  raises:
//@    PermanentException: command.region !in SUPPORTED_REGIONS
//@    RetryableException: devicesApi unavailable
class RegisterDeviceRoute
