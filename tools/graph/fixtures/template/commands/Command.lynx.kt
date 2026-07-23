// TARGET: external/messages/commands/{{Command}}.kt
// REALIZATION: generate
// MULTIPLIER: one class per declared {{Command}} instance

//@contract: commands.{{Command}}
//@  lang: kotlin
//@  signature: data class {{Command}}(val id: String, val deviceId: String, val value: Long)
//@  post: instances are immutable value carriers; no behavior
//@  assigns: []
class CommandStub
