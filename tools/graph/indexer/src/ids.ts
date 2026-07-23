//@realizes: [contracts/graph#StableIds]
// Stable ids per spec §3/§3.1: `kind:file#name[@instance]`; unnamed blocks get content-hash names.
import * as crypto from 'node:crypto';

/** Locale-independent string comparator — sort order must be identical on every machine (byte-determinism). */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Spec §3.1: content-hash name for an unnamed block or marker — `<kind>@h<sha256-hex-8>`,
 * disambiguated `-2`, `-3`, … per file by order of appearance. Line-shift-immune: the id
 * changes only when the block's own text changes.
 */
export function hashName(kind: string, text: string, taken: Set<string>): string {
  const h = crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
  const base = `${kind}@h${h}`;
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

export function nodeId(kind: string, file: string, name?: string, instance?: string): string {
  let id = `${kind}:${file}`;
  if (name) id += `#${name}`;
  if (instance) id += `@${instance}`;
  return id;
}
