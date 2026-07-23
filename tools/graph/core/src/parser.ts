//@realizes: [contracts/graph#CoreParser]  # origin: the LSP parser, unified into @lynx/core — the extension now imports this package
import { BLOCK_KINDS, SHORTHAND_KEYS, BLOCKS, FILL_TOKEN_RE } from './spec';

export interface Range0 {
  start: number;
  end: number;
}

export interface Entry {
  key?: string;
  value?: string;
  comment?: string;
  line: number;
  /** Indent measured inside the //@ content. */
  indent: number;
  keyRange?: Range0;
  valueRange?: Range0;
  listItem: boolean;
  rawBlock: boolean;
  children: Entry[];
}

export interface Block {
  kind: string;
  /** false ⇒ the kind identifier is not in the v1.3 grammar. */
  known: boolean;
  name?: string;
  /** Columns of `name` on startLine, when present. */
  nameRange?: Range0;
  startLine: number;
  endLine: number;
  kindRange: Range0;
  entries: Entry[];
  form: 'line' | 'kdoc';
  /** true ⇒ implicit contract block opened by a shorthand key (§4). */
  implicit: boolean;
  /** Name of the declaration (fun/class/…) the block attaches to, if any. */
  attachedTo?: string;
}

export interface FillRef {
  token: string;
  line: number;
  start: number;
  end: number;
}

export interface ParsedFile {
  uri: string;
  blocks: Block[];
  fills: FillRef[];
  lineCount: number;
}

const LINE_MARKER = /^(\s*)(\/\/@|#@)(.*)$/;  // both markers, everywhere (heritage v0.2: "tools accept both")
const KEY_LINE = /^(\s*)([A-Za-z_][\w-]*)\s*:(.*)$/;
const LIST_LINE = /^(\s*)-\s+(.*)$/;
const KDOC_TAG = /^\s*\*?\s*@([A-Za-z_][\w-]*)\b\s*(.*)$/;
const DECL = /\b(?:fun|class|object|interface|enum class|record)\s+([A-Za-z_][\w]*)|(?:public|protected|private)?\s*(?:static\s+)?[\w<>,.\[\]]+\s+([a-z][\w]*)\s*\(/;

/** Strip a trailing `# comment` that is outside quotes/backticks. */
function splitComment(text: string): { value: string; comment?: string; commentAt?: number } {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '#' && i > 0 && /\s/.test(text[i - 1])) {
      return { value: text.slice(0, i).trimEnd(), comment: text.slice(i + 1).trim(), commentAt: i };
    }
  }
  return { value: text.trimEnd() };
}

function isRawIntro(value: string | undefined): boolean {
  return value === '|' || value === '>' || value === '|-' || value === '>-';
}

export function parseDocument(text: string, uri: string): ParsedFile {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  const fills: FillRef[] = [];

  let current: Block | null = null;
  /** Stack of open entries, innermost last. */
  let stack: Entry[] = [];
  let inKdoc = false;

  const close = (endLine: number) => {
    if (current) {
      current.endLine = endLine;
      blocks.push(current);
      current = null;
      stack = [];
    }
  };

  const attachEntry = (entry: Entry) => {
    while (stack.length > 0 && stack[stack.length - 1].indent >= entry.indent && !(stack[stack.length - 1].rawBlock && stack[stack.length - 1].indent < entry.indent)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else current!.entries.push(entry);
    stack.push(entry);
  };

  const parseContent = (content: string, line: number, contentCol: number) => {
    // Raw-block continuation: everything deeper than an open |/> entry is raw text.
    for (let i = stack.length - 1; i >= 0; i--) {
      const open = stack[i];
      if (open.rawBlock) {
        const indent = content.length - content.trimStart().length;
        if (content.trim() === '' || indent > open.indent) {
          open.children.push({ line, indent, listItem: false, rawBlock: false, children: [], value: content.trim() });
          return;
        }
      }
    }
    const list = LIST_LINE.exec(content);
    if (list) {
      const indent = list[1].length;
      const body = splitComment(list[2]);
      const inline = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(body.value);
      const bodyStart = contentCol + indent + 2;
      const entry: Entry = {
        line,
        indent,
        listItem: true,
        rawBlock: isRawIntro(inline ? inline[2].trim() : undefined),
        children: [],
        key: inline ? inline[1] : undefined,
        value: inline ? inline[2].trim() : body.value,
        comment: body.comment,
        valueRange: { start: bodyStart, end: bodyStart + body.value.length },
      };
      attachEntry(entry);
      return;
    }
    const kv = KEY_LINE.exec(content);
    if (kv) {
      const indent = kv[1].length;
      const body = splitComment(kv[3].trim());
      const keyStart = contentCol + indent;
      const valueStart = contentCol + content.indexOf(':', indent) + 1 + (kv[3].length - kv[3].trimStart().length);
      const entry: Entry = {
        line,
        indent,
        listItem: false,
        rawBlock: isRawIntro(body.value),
        children: [],
        key: kv[2],
        value: body.value === '' ? undefined : body.value,
        comment: body.comment,
        keyRange: { start: keyStart, end: keyStart + kv[2].length },
        valueRange: { start: valueStart, end: valueStart + body.value.length },
      };
      attachEntry(entry);
      return;
    }
    // Free continuation text (§15 multi-line expression) — raw child of the innermost entry.
    if (content.trim() !== '') {
      const indent = content.length - content.trimStart().length;
      const entry: Entry = { line, indent, listItem: false, rawBlock: false, children: [], value: content.trim() };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(entry);
      else current!.entries.push(entry);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    // Fills live anywhere — //@ blocks, TARGET: headers, registry tables (§20.1–§20.2).
    collectFills(lineText, i, fills);

    // KDoc/Javadoc tag form (§2.2)
    if (!inKdoc && /^\s*\/\*\*/.test(lineText)) inKdoc = true;
    if (inKdoc) {
      const tag = KDOC_TAG.exec(lineText);
      if (tag) {
        const name = tag[1];
        const at = lineText.indexOf('@' + name);
        if (BLOCK_KINDS.includes(name)) {
          close(i - 1);
          current = {
            kind: name, known: true, name: tag[2].trim() || undefined,
            startLine: i, endLine: i, kindRange: { start: at, end: at + name.length + 1 },
            entries: [], form: 'kdoc', implicit: false,
          };
        } else if (current?.form === 'kdoc') {
          current.entries.push({
            line: i, indent: 0, listItem: false, rawBlock: false, children: [],
            key: name, value: tag[2].trim() || undefined,
            keyRange: { start: at, end: at + name.length + 1 },
            valueRange: { start: at + name.length + 2, end: lineText.length },
          });
        }
      }
      if (/\*\//.test(lineText)) {
        inKdoc = false;
        if (current?.form === 'kdoc') close(i);
      }
      continue;
    }

    const m = LINE_MARKER.exec(lineText);
    if (!m) {
      if (current) {
        close(i - 1);
        // Attach the declaration that follows the block, if this line declares one.
        const last = blocks[blocks.length - 1];
        const decl = DECL.exec(lineText);
        if (decl && last) last.attachedTo = decl[1] ?? decl[2];
      } else if (blocks.length > 0 && lineText.trim() !== '') {
        const last = blocks[blocks.length - 1];
        if (last.endLine === i - 1 && !last.attachedTo) {
          const decl = DECL.exec(lineText);
          if (decl) last.attachedTo = decl[1] ?? decl[2];
        }
      }
      continue;
    }

    const contentCol = m[1].length + m[2].length;
    const content = m[3];

    const head = /^([A-Za-z_][\w-]*)\s*:?\s*(.*)$/.exec(content.trim());
    const headIndent = content.length - content.trimStart().length;

    if (content.trim() === 'end') {
      close(i);
      continue;
    }

    if (head && headIndent === 0 && BLOCK_KINDS.includes(head[1]) && content.trim().startsWith(head[1] + ':')) {
      close(i - 1);
      const kindStart = contentCol + headIndent;
      const name = splitComment(head[2]).value || undefined;
      let nameRange: Range0 | undefined;
      if (name) {
        const nameAt = content.indexOf(name, content.indexOf(':') + 1);
        if (nameAt >= 0) nameRange = { start: contentCol + nameAt, end: contentCol + nameAt + name.length };
      }
      current = {
        kind: head[1], known: true, name, nameRange,
        startLine: i, endLine: i, kindRange: { start: kindStart, end: kindStart + head[1].length },
        entries: [], form: 'line', implicit: false,
      };
      continue;
    }

    if (!current) {
      if (head && SHORTHAND_KEYS.includes(head[1]) && content.trim().includes(':')) {
        // Single-line shorthand opens an implicit contract block (§4).
        const kindStart = contentCol + headIndent;
        current = {
          kind: 'contract', known: true, startLine: i, endLine: i,
          kindRange: { start: kindStart, end: kindStart + head[1].length },
          entries: [], form: 'line', implicit: true,
        };
        parseContent(content, i, contentCol);
      } else if (head && headIndent === 0 && content.trim().startsWith(head[1] + ':') && !(head[1] in BLOCKS)) {
        // Unknown top-level kind — surface for diagnostics.
        const kindStart = contentCol + headIndent;
        current = {
          kind: head[1], known: false, name: head[2] || undefined,
          startLine: i, endLine: i, kindRange: { start: kindStart, end: kindStart + head[1].length },
          entries: [], form: 'line', implicit: false,
        };
      }
      continue;
    }

    parseContent(content, i, contentCol);
    current.endLine = i;
  }
  close(lines.length - 1);

  return { uri, blocks, fills, lineCount: lines.length };
}

function collectFills(lineText: string, line: number, fills: FillRef[]) {
  FILL_TOKEN_RE.lastIndex = 0;
  let f: RegExpExecArray | null;
  while ((f = FILL_TOKEN_RE.exec(lineText)) !== null) {
    fills.push({ token: f[1], line, start: f.index, end: f.index + f[0].length });
  }
}

/** Flatten an entry tree into a list (pre-order). */
export function walkEntries(entries: Entry[]): Entry[] {
  const out: Entry[] = [];
  const visit = (e: Entry) => {
    out.push(e);
    e.children.forEach(visit);
  };
  entries.forEach(visit);
  return out;
}

/** Parse a `[a, b, c]` or bare list value into items with their offsets. */
export function parseListValue(value: string, valueStart: number): { item: string; start: number; end: number }[] {
  const inner = value.trim();
  const body = inner.startsWith('[') && inner.endsWith(']') ? inner.slice(1, -1) : inner;
  const baseOffset = valueStart + value.indexOf(body === '' ? '' : body);
  const items: { item: string; start: number; end: number }[] = [];
  let pos = 0;
  for (const part of body.split(',')) {
    const trimmed = part.trim();
    if (trimmed !== '') {
      const start = baseOffset + pos + part.indexOf(trimmed);
      items.push({ item: trimmed, start, end: start + trimmed.length });
    }
    pos += part.length + 1;
  }
  return items;
}
