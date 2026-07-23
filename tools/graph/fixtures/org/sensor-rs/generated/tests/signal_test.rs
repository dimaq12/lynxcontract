// language-aware test-case detection must find rust `fn`s (regression: was hardcoded to kotlin `fun`)

fn scores_within_unit_range() {
    // post: result.score in [0.0, 1.0]
}

fn rejects_zero_value() {
    // pre: reading.value > 0
}
