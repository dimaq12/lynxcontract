package internal

// TEMPLATE-GAP: pairing helper absent from the go template; inlined here
func Handle(evt CaptureStarted) ReadingRelayed {
	return ReadingRelayed{ReadingId: evt.CaptureId + "-reading"}
}

func (r *RelayRoute) flushPending() int {
	return 0
}
