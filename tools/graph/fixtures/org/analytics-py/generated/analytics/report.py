# TEMPLATE-GAP: idempotency ledger absent from the python template; inlined dedup set
_SEEN = set()


def ingest(event):
    if event.reading_id in _SEEN:
        return
    _SEEN.add(event.reading_id)


async def flush_metrics():
    pass
