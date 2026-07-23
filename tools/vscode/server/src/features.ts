//@realizes: [contracts/server#Features]
// Pure module: LSP-shaped plain objects, docs sourced from spec.ts only (§20.8-7 single-source).
import { BLOCKS, BLOCK_KINDS, SHORTHAND_KEYS } from '@lynx/core';
import { Block, Entry, ParsedFile } from '@lynx/core';
import { WorkspaceIndex } from './workspaceIndex';

export interface Position {
  line: number;
  character: number;
}

const KIND_SNIPPET: Record<string, string> = {
  contract: 'contract:\n//@  intent: >\n//@    ${1:why this unit exists}\n//@  pre: ${2:condition}\n//@  post: ${3:condition}\n//@  assigns: [${4}]',
  module: 'module:\n//@  layer: ${1:adapter}\n//@  package: ${2:com.example}\n//@  depends: [${3}]\n//@  restrictions: [${4}]',
  messaging: 'messaging:\n//@  consumes:\n//@    topic: ${1:provider.domain.command.action}\n//@    as: ${2:Command}\n//@    format: ${3|envelope-json,avro,json|}\n//@    group: ${4:group}\n//@  produces:\n//@    - topic: ${5:domain.event.name}\n//@      as: ${6:Event}\n//@  errors:\n//@    TransientException: retry-in-process\n//@    RetryableException: retry-topic\n//@    PermanentException: failed-event + dlq\n//@  dlq: ${7:provider.domain.dlq}',
  flow: 'flow:\n//@  from: topic ${1:source}\n//@  through:\n//@    - ${2:Step}\n//@  to: topic ${3:sink}\n//@  privacy: ${4|public,internal,pii,phi|}',
  graph: 'graph: ${1:module.name}\n//@  files:\n//@    - ${2:path}   realizes: [${3:contract}]\n//@  depends:\n//@    ${4:file}: [${5}]',
  observability: 'observability:\n//@  operations: [${1:domain.verb}]\n//@  logFields:\n//@    - operation\n//@    - correlationId\n//@    - outcome\n//@    - duration_ms\n//@  outcome: [${2:ok, failed}]',
  plugin: 'plugin: ${1:registry.name}\n//@  interface: ${2:signature}\n//@  registry: ${3:Registry.kt}\n//@  key: ${4:selector}\n//@  members: [${5}]\n//@  onMissing: ${6:raise IllegalStateException}',
};

function blockAt(file: ParsedFile, line: number): Block | undefined {
  return file.blocks.find((b) => line >= b.startLine && line <= b.endLine);
}

// ---------- completion ----------

export function completion(file: ParsedFile, lineText: string, pos: Position): unknown[] {
  const prefix = lineText.slice(0, pos.character);
  const marker = /^(\s*)(?:\/\/@|#@)(.*)$/.exec(prefix);
  if (!marker) return [];
  const content = marker[2];
  const block = blockAt(file, pos.line);

  // Enum values right after `key:`
  const enumCtx = /([A-Za-z_][\w-]*)\s*:\s*([\w-]*)$/.exec(content);
  if (enumCtx && block?.known) {
    const kd = BLOCKS[block.kind].keys[enumCtx[1]] ?? BLOCKS.messaging.keys[enumCtx[1]];
    if (kd?.values) {
      return kd.values.map((v) => ({ label: v, kind: 12 /* Value */, detail: `${enumCtx[1]} (${kd.section})` }));
    }
  }

  // Block starters at content indent 0, or when no block is open.
  const atStart = /^\s*[\w-]*$/.test(content);
  if (atStart && (!block || pos.line === block.startLine || content.trim() !== '')) {
    const starters = BLOCK_KINDS.map((k) => ({
      label: `${k}:`,
      kind: 15 /* Snippet */,
      detail: `//@${k}: block (${BLOCKS[k].section})`,
      documentation: { kind: 'markdown', value: BLOCKS[k].doc },
      insertText: KIND_SNIPPET[k],
      insertTextFormat: 2 /* Snippet */,
    }));
    const shorthand = SHORTHAND_KEYS.map((k) => ({
      label: k,
      kind: 5 /* Field */,
      detail: `shorthand //@${k}: (§4)`,
      documentation: { kind: 'markdown', value: BLOCKS.contract.keys[k]?.doc ?? '' },
      insertText: `${k}: `,
    }));
    const end = { label: 'end', kind: 14 /* Keyword */, detail: 'block sentinel (§2.1)' };
    if (!block || pos.line === block.startLine) return [...starters, ...shorthand, end];
    // Inside a block: keys of that kind win, starters still offered.
    return [...keysOf(block), ...starters, end];
  }

  if (block?.known && /^\s+[\w-]*$/.test(content)) return keysOf(block);
  return [];
}

function keysOf(block: Block): unknown[] {
  return Object.entries(BLOCKS[block.kind].keys).map(([name, kd]) => ({
    label: name,
    kind: 5 /* Field */,
    detail: `${kd.type} (${kd.section})`,
    documentation: { kind: 'markdown', value: kd.doc },
    insertText: `${name}: `,
  }));
}

// ---------- hover ----------

export function hover(file: ParsedFile, lineText: string, pos: Position): { contents: { kind: string; value: string } } | null {
  if (!/\/\/@|#@/.test(lineText) && !/^\s*\*?\s*@\w+/.test(lineText)) return null;
  const word = wordAt(lineText, pos.character);
  if (!word) return null;
  const block = blockAt(file, pos.line);

  if (BLOCK_KINDS.includes(word)) {
    const b = BLOCKS[word];
    return md(`**\`//@${word}:\`** — ${b.doc}\n\n*LynxContract v1.3 ${b.section}*`);
  }
  if (block?.known) {
    const kd = BLOCKS[block.kind].keys[word] ?? (block.kind === 'messaging' ? BLOCKS.messaging.keys[word] : undefined);
    if (kd) {
      const vals = kd.values ? `\n\nValues: ${kd.values.map((v) => `\`${v}\``).join(' | ')}` : '';
      return md(`**\`${word}\`** *(${kd.type})* — ${kd.doc}${vals}\n\n*LynxContract v1.3 ${kd.section}*`);
    }
  }
  return null;
}

function md(value: string) {
  return { contents: { kind: 'markdown', value } };
}

function wordAt(lineText: string, character: number): string | undefined {
  const re = /[A-Za-z_][\w-]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    if (m.index <= character && character <= m.index + m[0].length) return m[0];
  }
  return undefined;
}

// ---------- definition ----------

export function definition(index: WorkspaceIndex, lineText: string, pos: Position): { uri: string; range: unknown } | null {
  if (!/\/\/@|#@/.test(lineText)) return null;
  const re = /[\w./{}-]+(?:#[\w.]+)?/g;
  let m: RegExpExecArray | null;
  let token: string | undefined;
  while ((m = re.exec(lineText)) !== null) {
    if (m.index <= pos.character && pos.character <= m.index + m[0].length) {
      token = m[0];
      break;
    }
  }
  if (!token || token.includes('{{')) return null;

  const anchor = token.includes('#') || token.includes('/') || /\.(kt|kts|java|md|lynx)/.test(token)
    ? index.resolveAnchor(token)
    : undefined;
  if (anchor) return loc(anchor.uri, anchor.line);

  return null;
}

function loc(uri: string, line: number) {
  return { uri, range: { start: { line, character: 0 }, end: { line, character: 200 } } };
}

// ---------- document symbols ----------

const SYMBOL_KIND: Record<string, number> = {
  contract: 11, module: 2, messaging: 24, flow: 12, graph: 19, observability: 24, plugin: 19,
};

export function documentSymbols(file: ParsedFile): unknown[] {
  return file.blocks.filter((b) => b.known).map((b) => {
    const range = {
      start: { line: b.startLine, character: 0 },
      end: { line: b.endLine, character: 500 },
    };
    return {
      name: `@${b.kind}${b.name ? ': ' + b.name : b.attachedTo ? ' → ' + b.attachedTo : ''}`,
      detail: BLOCKS[b.kind].section,
      kind: SYMBOL_KIND[b.kind] ?? 19,
      range,
      selectionRange: {
        start: { line: b.startLine, character: b.kindRange.start },
        end: { line: b.startLine, character: b.kindRange.end },
      },
      children: [],
    };
  });
}

// ---------- semantic tokens ----------

// Standard LSP token types only — any semantic-aware theme colors them unconfigured.
export const TOKEN_TYPES = ['keyword', 'property', 'enumMember', 'class', 'function', 'namespace', 'type', 'macro', 'comment', 'number'];
export const TOKEN_MODIFIERS = ['declaration', 'documentation'];

const T = { keyword: 0, property: 1, enumMember: 2, class: 3, function: 4, namespace: 5, type: 6, macro: 7, comment: 8, number: 9 };
const M = { none: 0, declaration: 1, documentation: 2 };

const NAMESPACE_VALUE_KEYS = new Set(['topic', 'dlq', 'package', 'gradleModule', 'realizes', 'realizedBy']);
const TYPE_VALUE_KEYS = new Set(['as', 'emits', 'returns', 'signature', 'interface']);
const DOC_KEYS = new Set(['intent', 'doc', 'vanilla', 'compat', 'rules', 'addModule']);
const EXPR_VALUE_KEYS = new Set(['pre', 'post', 'inv', 'when', 'key', 'onMissing']);
const EXPR_KEYWORD_RE = /\b(old|result|forall|exists|raises|if|in|and|or|not|len)\b/g;
const NUMBER_RE = /\b\d+(?:\.\d+)?\b/g;

interface Tok { line: number; start: number; end: number; type: number; mods: number; }

class TokenSink {
  private toks: Tok[] = [];
  /** Tokens never overlap — first writer to a range wins (fills are added first). */
  add(line: number, start: number, end: number, type: number, mods = M.none): void {
    if (end <= start) return;
    if (this.toks.some((t) => t.line === line && start < t.end && t.start < end)) return;
    this.toks.push({ line, start, end, type, mods });
  }
  /** LSP delta encoding over the exported legend. */
  encode(): number[] {
    this.toks.sort((a, b) => a.line - b.line || a.start - b.start);
    const data: number[] = [];
    let prevLine = 0;
    let prevStart = 0;
    for (const t of this.toks) {
      const dLine = t.line - prevLine;
      const dStart = dLine === 0 ? t.start - prevStart : t.start;
      data.push(dLine, dStart, t.end - t.start, t.type, t.mods);
      prevLine = t.line;
      prevStart = t.start;
    }
    return data;
  }
}

export function semanticTokens(file: ParsedFile): number[] {
  const sink = new TokenSink();
  for (const f of file.fills) sink.add(f.line, f.start, f.end, T.macro);

  for (const block of file.blocks) {
    if (!block.known) continue;
    sink.add(block.startLine, block.kindRange.start, block.kindRange.end, T.keyword, M.declaration);
    if (block.nameRange) sink.add(block.startLine, block.nameRange.start, block.nameRange.end, T.function, M.declaration);
    visitEntries(block.entries, undefined, sink);
  }
  return sink.encode();
}

function visitEntries(entries: Entry[], parentKey: string | undefined, sink: TokenSink): void {
  for (const e of entries) {
    const underExceptionMap = parentKey === 'raises' || parentKey === 'errors';
    if (e.key && e.keyRange) {
      sink.add(e.line, e.keyRange.start, e.keyRange.end, underExceptionMap ? T.class : T.property);
    }
    if (e.value && e.valueRange && !e.rawBlock) {
      valueTokens(e, parentKey, underExceptionMap, sink);
    }
    if (!e.rawBlock) visitEntries(e.children, e.key ?? parentKey, sink);
  }
}

function valueTokens(e: Entry, parentKey: string | undefined, underErrors: boolean, sink: TokenSink): void {
  const { line, value } = e;
  const vr = e.valueRange!;
  const key = e.key ?? parentKey ?? '';

  if (underErrors && parentKey === 'errors') {
    // route list: `failed-event + dlq` — each part is a closed-vocabulary member
    let pos = 0;
    for (const part of value!.split('+')) {
      const trimmed = part.trim();
      if (trimmed !== '') {
        const at = vr.start + pos + part.indexOf(trimmed);
        sink.add(line, at, at + trimmed.length, T.enumMember);
      }
      pos += part.length + 1;
    }
    return;
  }
  if (DOC_KEYS.has(key)) {
    sink.add(line, vr.start, vr.end, T.comment, M.documentation);
    return;
  }
  if (NAMESPACE_VALUE_KEYS.has(key)) {
    sink.add(line, vr.start, vr.end, T.namespace);
    return;
  }
  if (TYPE_VALUE_KEYS.has(key)) {
    sink.add(line, vr.start, vr.end, T.type);
    return;
  }
  const kd = e.key ? (BLOCKS.messaging.keys[e.key]?.values ? BLOCKS.messaging.keys[e.key] : undefined) : undefined;
  const enumValues = kd?.values ?? (e.key ? enumValuesAcrossBlocks(e.key) : undefined);
  if (enumValues && enumValues.includes(value!.replace(/^["']|["']$/g, ''))) {
    sink.add(line, vr.start, vr.end, T.enumMember);
    return;
  }
  if (EXPR_VALUE_KEYS.has(key) || underErrors) {
    regexTokens(line, value!, vr.start, EXPR_KEYWORD_RE, T.keyword, sink);
    regexTokens(line, value!, vr.start, NUMBER_RE, T.number, sink);
  }
}

function enumValuesAcrossBlocks(key: string): string[] | undefined {
  for (const spec of Object.values(BLOCKS)) {
    const kd = spec.keys[key];
    if (kd?.values) return kd.values;
  }
  return undefined;
}

function regexTokens(line: number, value: string, offset: number, re: RegExp, type: number, sink: TokenSink): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    sink.add(line, offset + m.index, offset + m.index + m[0].length, type);
  }
}

// ---------- folding ----------

export function foldingRanges(file: ParsedFile): unknown[] {
  return file.blocks
    .filter((b) => b.endLine > b.startLine)
    .map((b) => ({ startLine: b.startLine, endLine: b.endLine, kind: 'region' }));
}
