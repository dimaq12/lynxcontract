# acme-telemetry template oracle

- RULE[no-provider-prefix]: produced events never carry the provider prefix (§18.1 asymmetry) -> binds StartCaptureRoute.lynx.kt#StartCaptureRoute
- RULE[no-retry-actuation]: capture creation is actuation-adjacent; never auto-retry a non-idempotent call
- PIN[corelab-openapi]: corelab-api-docs@9f3c2e1
- QUIRK[captur-startd-key]: produced record key literal `captur-startd` keeps the (invented) CoreLab reference misspelling — wire-true, independently frozen
