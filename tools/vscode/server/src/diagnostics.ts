//@realizes: [contracts/server#Diagnostics]
// Pure module: plain-object diagnostics, LSP-shape-compatible, no runtime deps.
import {
  BLOCKS, ERROR_ROUTES, EXPR_KEYS, PROFILE_TOPICS, isProviderPrefixedEvent,
} from '@lynx/core';
import { Block, Entry, ParsedFile, parseListValue, walkEntries } from '@lynx/core';
import { WorkspaceIndex } from './workspaceIndex';

export const SEV = { Error: 1, Warning: 2, Information: 3, Hint: 4 } as const;

export interface LynxDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: number;
  code: string;
  source: 'lynxcontract';
  message: string;
}

export interface Settings {
  acmeProfile: boolean;
  unknownKeySeverity: 'warning' | 'information' | 'off';
}

export const DEFAULT_SETTINGS: Settings = { acmeProfile: false, unknownKeySeverity: 'warning' };

function diag(line: number, start: number, end: number, severity: number, code: string, message: string): LynxDiagnostic {
  return {
    range: { start: { line, character: start }, end: { line, character: Math.max(end, start + 1) } },
    severity, code, source: 'lynxcontract', message,
  };
}

function entryDiag(e: Entry, severity: number, code: string, message: string): LynxDiagnostic {
  const r = e.valueRange ?? e.keyRange ?? { start: 0, end: 1 };
  return diag(e.line, r.start, r.end, severity, code, message);
}

const NESTED_MESSAGING_KEYS = new Set(['topic', 'as', 'format', 'group', 'key', 'when']);

export function validate(file: ParsedFile, index: WorkspaceIndex, settings: Settings): LynxDiagnostic[] {
  const out: LynxDiagnostic[] = [];
  for (const block of file.blocks) {
    if (!block.known) {
      out.push(diag(block.startLine, block.kindRange.start, block.kindRange.end, SEV.Error, 'lynx.unknown-block',
        `Unknown block kind \`${block.kind}\` — v1.3 kinds are: ${Object.keys(BLOCKS).join(', ')} (§3).`));
      continue;
    }
    structural(block, settings, out);
    if (block.kind === 'messaging') messaging(block, settings, out);
    if (block.kind === 'graph') graphInventory(block, file, index, out);
    realizationEdges(block, file, index, out);
  }
  tokenClosure(file, index, out);
  return out;
}

// ---------- structural (§4, §5, §6, §13.1, §19) ----------

function structural(block: Block, settings: Settings, out: LynxDiagnostic[]): void {
  const spec = BLOCKS[block.kind];
  const unknownSev = settings.unknownKeySeverity === 'warning' ? SEV.Warning : SEV.Information;

  for (const e of block.entries) {
    if (!e.key) continue;
    const kd = spec.keys[e.key];
    if (!kd) {
      if (settings.unknownKeySeverity !== 'off') {
        const r = e.keyRange ?? { start: 0, end: 1 };
        out.push(diag(e.line, r.start, r.end, unknownSev, 'lynx.unknown-key',
          `Key \`${e.key}\` is not in the \`//@${block.kind}:\` grammar (${spec.section}). Unknown keys are ignored (§19).`));
      }
      continue;
    }
    if (kd.values && e.value && !e.rawBlock) {
      const v = e.value.replace(/^["']|["']$/g, '');
      if (!v.includes('{{') && !kd.values.includes(v)) {
        out.push(entryDiag(e, SEV.Error, 'lynx.bad-enum',
          `\`${e.key}\` must be one of: ${kd.values.join(' | ')} (${kd.section}); got \`${v}\`.`));
      }
    }
    checkExpressions(e, e.key, out);
    // Nested keys of consumes/produces are messaging keys (§13.1).
    if (block.kind === 'messaging' && (e.key === 'consumes' || e.key === 'produces')) {
      for (const child of walkEntries(e.children)) {
        if (!child.key || child.rawBlock) continue;
        if (!NESTED_MESSAGING_KEYS.has(child.key)) {
          if (settings.unknownKeySeverity !== 'off') {
            const r = child.keyRange ?? child.valueRange ?? { start: 0, end: 1 };
            out.push(diag(child.line, r.start, r.end, unknownSev, 'lynx.unknown-key',
              `Key \`${child.key}\` is not a \`${e.key}\` sub-key (§13.1): ${[...NESTED_MESSAGING_KEYS].join(', ')}.`));
          }
        } else if (child.key === 'format' && child.value) {
          const kd2 = spec.keys.format;
          const v = child.value.replace(/^["']|["']$/g, '');
          if (kd2.values && !v.includes('{{') && !kd2.values.includes(v)) {
            out.push(entryDiag(child, SEV.Error, 'lynx.bad-enum',
              `\`format\` must be one of: ${kd2.values.join(' | ')} (§13.1); got \`${v}\`.`));
          }
        }
      }
    }
  }
}

function checkExpressions(e: Entry, topKey: string, out: LynxDiagnostic[]): void {
  const exprs: Entry[] = [];
  if (EXPR_KEYS.has(topKey)) {
    if (e.value && !e.rawBlock) exprs.push(e);
    for (const child of e.children) if (child.value && !child.key) exprs.push(child);
  }
  for (const ex of exprs) {
    const v = ex.value!;
    if (v.includes('old(') && topKey !== 'post' && topKey !== 'inv') {
      out.push(entryDiag(ex, SEV.Error, 'lynx.old-scope',
        '`old()` is allowed only in `post` and `inv` (§6).'));
    }
    if (/[^!]!!(?!=)/.test(v)) {
      out.push(entryDiag(ex, SEV.Error, 'lynx.bang-bang',
        'Non-null assert `!!` is not allowed in contract expressions — they must be side-effect-free (§5).'));
    }
  }
}

// ---------- messaging (§13.3 + §18.1) ----------

interface ProducesItem {
  topic?: Entry;
  when?: Entry;
  raisesException?: string;
}

function messaging(block: Block, settings: Settings, out: LynxDiagnostic[]): void {
  const top = new Map(block.entries.filter((e) => e.key).map((e) => [e.key!, e]));

  // Collect produces items (list items under `produces`).
  const producesEntry = top.get('produces');
  const produces: ProducesItem[] = [];
  if (producesEntry) {
    const items = producesEntry.children.filter((c) => c.listItem);
    for (const item of items) {
      const p: ProducesItem = {};
      const parts = [item, ...walkEntries(item.children)];
      for (const e of parts) {
        if (e.key === 'topic') p.topic = e;
        if (e.key === 'when') {
          p.when = e;
          const m = /^raises\s+([\w.]+)/.exec(e.value ?? '');
          if (m) p.raisesException = m[1];
        }
      }
      produces.push(p);
    }
    if (items.length === 0 && producesEntry.value) {
      // produces as inline single value is not per-spec, but tolerate.
    }
  }

  // errors map: exception → route(s)
  const errorsEntry = top.get('errors');
  const errorRoutes = new Map<string, Entry>();
  if (errorsEntry) {
    for (const child of errorsEntry.children) {
      if (child.key && child.value) errorRoutes.set(child.key, child);
    }
    if (!errorsEntry.children.some((c) => c.key) && errorsEntry.value) {
      const m = /^([\w.]+)\s*:\s*(.+)$/.exec(errorsEntry.value);
      if (m) errorRoutes.set(m[1], errorsEntry);
    }
  }

  // Route vocabulary is closed (§13.1).
  for (const [exception, e] of errorRoutes) {
    const routeText = routeOf(e);
    for (const part of routeText.split('+').map((s) => s.trim())) {
      if (part !== '' && !ERROR_ROUTES.includes(part)) {
        out.push(entryDiag(e, SEV.Error, 'lynx.bad-error-route',
          `Unknown error route \`${part}\` for \`${exception}\` — routes are: ${ERROR_ROUTES.join(' | ')} (§13.1).`));
      }
    }
  }

  // produces.when raises E must have a matching errors route (§13.3).
  for (const p of produces) {
    if (p.raisesException && !errorRoutes.has(p.raisesException) && p.when) {
      out.push(entryDiag(p.when, SEV.Error, 'lynx.unmatched-when',
        `\`when: raises ${p.raisesException}\` has no matching \`errors\` route for \`${p.raisesException}\` (§13.3).`));
    }
  }

  // idempotent: false + retry-topic ⇒ double-actuation risk (§13.3).
  const idempotent = top.get('idempotent');
  if (idempotent?.value === 'false') {
    for (const [exception, e] of errorRoutes) {
      if (routeOf(e).includes('retry-topic')) {
        out.push(entryDiag(e, SEV.Error, 'lynx.nonidempotent-retry',
          `\`idempotent: false\` + \`retry-topic\` for \`${exception}\`: retrying a non-idempotent actuator call risks double-actuation (§13.3).`));
      }
    }
  }

  // drop rules (§13.3, v1.2).
  for (const [exception, e] of errorRoutes) {
    const route = routeOf(e);
    if (!route.split('+').map((s) => s.trim()).includes('drop')) continue;
    if (!e.comment || e.comment.trim() === '') {
      out.push(entryDiag(e, SEV.Error, 'lynx.drop-rationale',
        `\`drop\` route for \`${exception}\` requires an inline rationale comment (e.g. \`# a callback answers no command\`) (§13.3).`));
    }
    if (route.includes('failed-event') || produces.some((p) => p.raisesException === exception)) {
      out.push(entryDiag(e, SEV.Error, 'lynx.drop-vs-failed',
        `\`drop\` and a failed event are mutually exclusive per exception class — \`${exception}\` has both (§13.3).`));
    }
  }

  if (settings.acmeProfile) acmeTopics(top, produces, out);
}

function routeOf(e: Entry): string {
  // For flat `errors: Exc: route` values the route is after the exception key.
  return e.value ?? '';
}

function topicLintable(v: string | undefined): v is string {
  return !!v && !v.includes('{{') && !v.includes('<property:') && !v.includes('${');
}

function acmeTopics(top: Map<string, Entry>, produces: ProducesItem[], out: LynxDiagnostic[]): void {
  const consumes = top.get('consumes');
  if (consumes) {
    const topicE = [consumes, ...walkEntries(consumes.children)].find((e) => e.key === 'topic');
    if (topicE && topicLintable(topicE.value) && !PROFILE_TOPICS.commandIn.test(topicE.value)) {
      out.push(entryDiag(topicE, SEV.Warning, 'lynx.topic-naming',
        `Consumed topic \`${topicE.value}\` does not match \`<provider>.<domain>.command.<action>\` (§18.1).`));
    }
  }
  for (const p of produces) {
    if (!p.topic || !topicLintable(p.topic.value)) continue;
    const t = p.topic.value;
    if (isProviderPrefixedEvent(t)) {
      out.push(entryDiag(p.topic, SEV.Error, 'lynx.event-prefix',
        `Produced event \`${t}\` carries a provider prefix — commands carry the provider prefix, events do not (§18.1).`));
    } else if (!PROFILE_TOPICS.eventOut.test(t) && !PROFILE_TOPICS.commandIn.test(t) && !PROFILE_TOPICS.retry.test(t)) {
      out.push(entryDiag(p.topic, SEV.Warning, 'lynx.topic-naming',
        `Produced topic \`${t}\` does not match any §18.1 template.`));
    }
    if (p.raisesException && PROFILE_TOPICS.eventOut.test(t) && !PROFILE_TOPICS.failedEvent.test(t)) {
      out.push(entryDiag(p.topic, SEV.Warning, 'lynx.failed-suffix',
        `Failure event \`${t}\` (produced on \`raises ${p.raisesException}\`) should end with \`-failed\` (§18.1).`));
    }
  }
  const dlq = top.get('dlq');
  if (dlq && topicLintable(dlq.value) && !PROFILE_TOPICS.dlqCode.test(dlq.value) && !PROFILE_TOPICS.dlqScoped.test(dlq.value)) {
    out.push(entryDiag(dlq, SEV.Warning, 'lynx.topic-naming',
      `DLQ \`${dlq.value}\` matches neither \`<provider>.<domain>.dlq\` nor \`<domain>.integration.dlq.<provider>\` (§18.1).`));
  }
}

// ---------- realization edges (§7.1) ----------

function realizationEdges(block: Block, file: ParsedFile, index: WorkspaceIndex, out: LynxDiagnostic[]): void {
  for (const e of walkEntries(block.entries)) {
    if (e.key === 'realizes' && e.value && e.valueRange) {
      for (const item of parseListValue(e.value, e.valueRange.start)) {
        if (item.item.includes('{{')) continue;
        if (!index.resolveAnchor(item.item)) {
          out.push(diag(e.line, item.start, item.end, SEV.Error, 'lynx.dangling-realizes',
            `\`realizes\` target \`${item.item}\` does not resolve to any contract in the workspace (§7.1).`));
        }
      }
    }
    if (e.key === 'realizedBy' && e.value && e.valueRange && block.kind !== 'graph') {
      for (const item of parseListValue(e.value, e.valueRange.start)) {
        if (item.item.includes('{{')) continue;
        if (!index.resolveFile(item.item, file.uri)) {
          out.push(diag(e.line, item.start, item.end, SEV.Warning, 'lynx.missing-realization',
            `\`realizedBy\` file \`${item.item}\` not found — contract not yet realized? (§7.1).`));
        }
      }
    }
  }
}

// ---------- graph inventory (§12.1) ----------

function graphInventory(block: Block, file: ParsedFile, index: WorkspaceIndex, out: LynxDiagnostic[]): void {
  const filesEntry = block.entries.find((e) => e.key === 'files');
  if (!filesEntry) return;
  for (const item of filesEntry.children.filter((c) => c.listItem)) {
    const text = item.value ?? '';
    const m = /^(\S+)(?:\s+realizes:\s*(.*))?$/.exec(text);
    if (!m) continue;
    const filePath = m[1];
    const r = item.valueRange ?? { start: 0, end: 1 };
    if (!filePath.includes('{{') && !index.resolveFile(filePath, file.uri)) {
      out.push(diag(item.line, r.start, r.start + filePath.length, SEV.Error, 'lynx.graph-missing-file',
        `Graph \`files\` entry \`${filePath}\` is missing on disk — inventory must match reality (§12.1).`));
    }
    if (m[2]) {
      for (const anchor of parseListValue(m[2], r.start + text.indexOf(m[2]))) {
        if (anchor.item.includes('{{')) continue;
        if (!index.resolveAnchor(anchor.item)) {
          out.push(diag(item.line, anchor.start, anchor.end, SEV.Error, 'lynx.dangling-realizes',
            `Graph realization edge \`${anchor.item}\` does not resolve to any contract (§12.1, §7.1).`));
        }
      }
    }
  }
}

// ---------- token closure (§20.2, §20.8-2) ----------

function tokenClosure(file: ParsedFile, index: WorkspaceIndex, out: LynxDiagnostic[]): void {
  if (file.fills.length === 0) return;
  const base = file.uri.toLowerCase();
  if (base.includes('fill-registry') || base.includes('fill_registry')) return;
  const registry = index.fillRegistry();
  if (!registry) return;
  for (const f of file.fills) {
    if (!registry.has(f.token)) {
      out.push(diag(f.line, f.start, f.end, SEV.Warning, 'lynx.unregistered-fill',
        `Fill \`{{${f.token}}}\` has no row in the Fill Registry — used ⊆ registered is a lint invariant (§20.2, §20.8).`));
    }
  }
}
