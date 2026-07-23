#!/usr/bin/env node
//@realizes: [contracts/graph#McpSurface]
// Stdio MCP server over the read-only index. Logging: stderr only (spec-blessed for stdio).
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { snapshotDirFor, writeSnapshot } from '@lynx/indexer/out/snapshots';
import { ToolError } from './tools';
import { OrgTools } from './orgTools';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dbPath = arg('db') ?? process.env.LYNX_DB;
if (!dbPath) {
  process.stderr.write('usage: lynx-graph-mcp --db <index.db> [--sources <lynx-sources.json>] [--snapshots <dir>]   (or LYNX_DB env)\n');
  process.exit(2);
}

const sourcesConfig = arg('sources');
// Snapshot registry (spec §6.4): --snapshots wins, else derived from the sources config.
const snapshotDir = arg('snapshots') ?? (sourcesConfig ? snapshotDirFor(sourcesConfig) : undefined);

const tools = new OrgTools(dbPath, { snapshotDir });
process.stderr.write(`lynx-graph: serving ${dbPath} (generation ${tools.generation})\n`);
if (snapshotDir) {
  try {
    const snap = writeSnapshot(dbPath, tools.generation, snapshotDir);
    process.stderr.write(`lynx-graph: snapshot ${snap.written ? 'registered' : 'already registered'}: ${snap.path}\n`);
  } catch (e) {
    process.stderr.write(`lynx-graph: snapshot registration failed: ${e}\n`);
  }
}

const server = new McpServer({ name: 'lynx-graph', version: '1.0.0' });

// zod3 + sdk generics hit TS2589 (excessively deep instantiation); registration goes through
// an untyped shim — the tool implementations themselves are typed and contract-tested.
const registerTool = (name: string, cfg: unknown, handler: (args: never) => unknown): void => {
  (server as unknown as { registerTool: (n: string, c: unknown, h: unknown) => void }).registerTool(name, cfg, handler);
};

function respond(result: object | ToolError) {
  if ('isError' in result && result.isError) {
    return { content: [{ type: 'text' as const, text: result.message }], isError: true };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

registerTool('lynx_schema', {
  description: 'Self-describing schema of the contract graph: tables, node/edge kinds, id format, worked example queries. Call this first.',
  inputSchema: {},
}, async () => respond(tools.schema()));

registerTool('lynx_query', {
  description: 'Read-only SELECT over the contract graph (nodes, edges, fts, lint views). Single statement; rows capped (default 50, max 500) with truncated/next_offset. The arbitrary-question surface.',
  inputSchema: { sql: z.string(), limit: z.number().int().optional(), offset: z.number().int().optional() },
}, async ({ sql, limit, offset }: { sql: string; limit?: number; offset?: number }) => respond(tools.query(sql, limit, offset)));

registerTool('lynx_contract_of', {
  description: 'Governing contract block(s) for a file (optionally a line): contract + fill values in force + the rules that bind there.',
  inputSchema: { file: z.string(), line: z.number().int().optional() },
}, async ({ file, line }: { file: string; line: number }) => respond(tools.contractOf(file, line)));

registerTool('lynx_why', {
  description: 'Provenance chain for a generated-code location, as an edge path (method -> contract -> rules/clauses/stub). The path, not prose.',
  inputSchema: { file: z.string(), line: z.number().int() },
}, async ({ file, line }: { file: string; line: number }) => respond(tools.why(file, line)));

registerTool('lynx_impact_of', {
  description: 'Closed regeneration set of a change: targets + tests transitively reachable from a fill token / contract / rule node.',
  inputSchema: { ref: z.string() },
}, async ({ ref }: { ref: string }) => respond(tools.impactOf(ref)));

registerTool('lynx_lint', {
  description: 'The §20.8 mechanical invariants as precomputed views; violations with node ids. Optional scope substring filters node ids.',
  inputSchema: { scope: z.string().optional() },
}, async ({ scope }: { scope?: string }) => respond(tools.lint(scope)));

registerTool('lynx_realizations_of', {
  description: 'All realization edges (realizes / realized_by / generates) matching a contract, stub or target reference.',
  inputSchema: { ref: z.string() },
}, async ({ ref }: { ref: string }) => respond(tools.realizationsOf(ref)));

registerTool('lynx_drift', {
  description: 'Where contract and code diverged: declared-but-unrealized signatures, undeclared methods, unexplained TEMPLATE-GAP/RECONSTRUCTED markers, contracts whose realizedBy file is missing — plus the gap ledger and declared deviations. Optional scope substring.',
  inputSchema: { scope: z.string().optional() },
}, async ({ scope }: { scope?: string }) => respond(tools.drift(scope)));

registerTool('lynx_explain_divergence', {
  description: 'Classify an observed divergence at file:line against the declarations: predicted (cites the deviation marker) | catalogued (cites the gap) | candidate_defect (cites the contracts/rules that should have covered it).',
  inputSchema: { file: z.string(), line: z.number().int(), observed: z.string() },
}, async ({ file, line, observed }: { file: string; line: number; observed: string }) => respond(tools.explainDivergence(file, line, observed)));

registerTool('lynx_runs', {
  description: 'Historical findings across instantiation runs (BATTLE-REPORT), filterable by run/class; contracts_by_recurrence answers "which contract produced findings in ≥N runs".',
  inputSchema: { run: z.string().optional(), class: z.string().optional(), min_runs: z.number().int().optional() },
}, async (a: { run?: string; class?: string; min_runs?: number }) => respond(tools.runs(a)));

registerTool('lynx_trace_requirement', {
  description: 'The audit chain for a fill token or value: requirement (registry row) → fill values → instances → targets → tests → run findings.',
  inputSchema: { ref: z.string() },
}, async ({ ref }: { ref: string }) => respond(tools.traceRequirement(ref)));

registerTool('lynx_modules', {
  description: 'Org hologram: module inventory with layer, health counters (contracts/stubs/targets/lint) and CODEOWNERS owners.',
  inputSchema: {},
}, async () => respond(tools.modules()));

registerTool('lynx_owners_of', {
  description: 'The CODEOWNERS principals behind a module, node id, or topic.',
  inputSchema: { ref: z.string() },
}, async ({ ref }: { ref: string }) => respond(tools.ownersOf(ref)));

registerTool('lynx_org_impact_of', {
  description: 'Org blast radius: impact closure that also crosses topics (produces → topic → consumers) — affected modules, targets, tests and their owners. impact_of answers "what do I regenerate"; this answers "who do I break".',
  inputSchema: { ref: z.string() },
}, async ({ ref }: { ref: string }) => respond(tools.orgImpactOf(ref)));

registerTool('lynx_hologram', {
  description: 'The org event mesh (module → topic → module), as json rows or a mermaid flowchart. Optional scope substring filters topics/modules.',
  inputSchema: { scope: z.string().optional(), format: z.enum(['json', 'mermaid']).optional() },
}, async ({ scope, format }: { scope?: string; format?: 'json' | 'mermaid' }) => respond(tools.hologram(scope, format ?? 'json')));

registerTool('lynx_snapshots', {
  description: 'The snapshot registry (spec §6.4): every registered index generation with its file, size, and which one is live. The discovery half of lynx_diff.',
  inputSchema: {},
}, async () => respond(tools.snapshots()));

registerTool('lynx_diff', {
  description: "Contract-level changelog between two index snapshots: added/removed nodes and edges classified (new-topic, new-consumer, enum-member-added, freeze-violated, layer-edge-introduced, …). A snapshot ref is a registered generation id (or unambiguous prefix — see lynx_snapshots), a path to an index .db file, or 'live'.",
  inputSchema: { snapshot_a: z.string(), snapshot_b: z.string() },
}, async ({ snapshot_a, snapshot_b }: { snapshot_a: string; snapshot_b: string }) => respond(tools.diffRefs(snapshot_a, snapshot_b)));

if (sourcesConfig) {
  const { Proposer } = require('./propose') as typeof import('./propose');
  const proposer = new Proposer(sourcesConfig);
  registerTool('lynx_propose_change', {
    description: 'The ONLY write path, guarded: propose a contract/manifest edit. Accepted into a staging copy (.lynx-staging/) iff lint stays clean and the edit carries a citation; returns the change classes and blast radius. Never touches generated code or the real tree.',
    inputSchema: { file: z.string(), new_text: z.string(), citation: z.string() },
  }, async ({ file, new_text, citation }: { file: string; new_text: string; citation: string }) =>
    respond(proposer.propose(file, new_text, citation)));
}

server.registerResource('node', new ResourceTemplate('lynx://node/{id}', { list: undefined }), {
  description: 'A graph node with its in/out edges, by stable id.',
}, async (uri, { id }) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(tools.node(String(id))) }],
}));

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
  process.stderr.write(`lynx-graph: fatal ${e}\n`);
  process.exit(1);
});
