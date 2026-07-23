//@realizes: [contracts/graph#StubModel]
// §20.1 stub headers + sanctioned markers: §20.4 template-side (etalon deviation) and §20.7 generated-output (TEMPLATE-GAP, RECONSTRUCTED, waiver).

export interface StubHeader {
  target?: { value: string; line: number };
  realization?: { mode: 'generate' | 'copy-verbatim' | 'n/a'; source?: string; line: number };
  multiplier: boolean;
}

export interface Marker {
  kind: 'template-gap' | 'deviation' | 'reconstructed' | 'waiver';
  line: number;
  text: string;
}

const TARGET_RE = /^\s*(?:\/\/|#|<!--)?\s*TARGET:\s*(.+?)\s*(?:-->)?\s*$/;
const REALIZATION_RE = /^\s*(?:\/\/|#|<!--)?\s*REALIZATION:\s*(generate|copy-verbatim|n\/a)\s*(.*?)\s*(?:-->)?\s*$/;
const MULTIPLIER_RE = /^\s*(?:\/\/|#|<!--)?\s*MULTIPLIER\b/;

/** Scan the head of a stub file (first 40 lines) for its §20.1 header. Tolerant: absent fields stay unset. */
export function parseStubHeader(text: string): StubHeader {
  const header: StubHeader = { multiplier: false };
  const lines = text.split(/\r?\n/).slice(0, 40);
  for (let i = 0; i < lines.length; i++) {
    const t = TARGET_RE.exec(lines[i]);
    if (t && !header.target) header.target = { value: t[1], line: i };
    const r = REALIZATION_RE.exec(lines[i]);
    if (r && !header.realization) {
      header.realization = { mode: r[1] as 'generate' | 'copy-verbatim' | 'n/a', source: r[2] || undefined, line: i };
    }
    if (MULTIPLIER_RE.test(lines[i])) header.multiplier = true;
  }
  return header;
}

// Both comment leaders accepted (jvm/go use //, python uses #) — LanguageProfiles rule.
const MARKER_RES: [RegExp, Marker['kind']][] = [
  [/(?:\/\/|#)\s*TEMPLATE-GAP:\s*(.*)$/, 'template-gap'],
  [/(?:\/\/|#)\s*etalon deviation:\s*(.*)$/, 'deviation'],
  [/\bRECONSTRUCTED\b(.*)$/, 'reconstructed'],
  [/(?:\/\/|#)\s*ASSERTION-WAIVER:\s*(.*)$/, 'waiver'],
];

/** Scan a generated file for sanctioned markers (§20.7). */
export function scanMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const [re, kind] of MARKER_RES) {
      const m = re.exec(lines[i]);
      if (m) {
        out.push({ kind, line: i, text: (m[1] ?? '').trim() });
        break;
      }
    }
  }
  return out;
}
