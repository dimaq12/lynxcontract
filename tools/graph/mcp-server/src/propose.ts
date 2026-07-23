//@realizes: [contracts/graph#Propose]
// The ONLY write path, guarded (spec §5): staging copy iff lint stays clean + citation given.
// Never touches generated code, never touches the real tree.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { loadOrgConfig } from '@lynx/indexer/out/config';
import { extractOrg, orgGenerationOf, buildOrgIndex, OrgInputs } from '@lynx/indexer/out/org';
import { writeDeterministic } from '@lynx/indexer/out/build';
import { OrgTools } from './orgTools';
import { ToolError } from './tools';

export interface ProposeResult {
  accepted: boolean;
  baseline_generation: string;
  staged_generation?: string;
  new_violations?: { invariant: string; node_id: string; message: string }[];
  changes?: unknown[];
  impact?: object;
  staged_dir?: string;
  citation: string;
}

interface Violation {
  invariant: string;
  node_id: string;
  message: string;
}

export class Proposer {
  constructor(private configPath: string) {}

  propose(file: string, newText: string, citation?: string): ProposeResult | ToolError {
    if (!citation || citation.trim() === '') {
      return { isError: true, message: 'A proposal must carry a citation (rule/spec/manifest reference) — uncited edits are rejected (spec §5, §20.7 remediation rigor).' };
    }

    const org = loadOrgConfig(this.configPath);
    const workspaceRoot = path.dirname(path.resolve(this.configPath));

    // Locate the file among declared sources; generated trees are off-limits.
    let found = false;
    for (const m of org.modules) {
      if (m.inputs.generated.some((g) => g.path === file)) {
        return { isError: true, message: `'${file}' is generated code — propose_change never touches generated output; change the contract/manifest and regenerate (spec §5, §20.6).` };
      }
      if (m.inputs.template.some((t) => t.path === file) || m.inputs.manifests.some((t) => t.path === file)) found = true;
    }
    if (!found) {
      return { isError: true, message: `'${file}' is not a template/manifest source in this workspace — nothing to propose against. Sources are listed in ${path.basename(this.configPath)}.` };
    }

    const baselineGeneration = orgGenerationOf(org);
    const baselineViolations = violationsOf(org);

    const staged = patch(org, file, newText);
    const stagedGeneration = orgGenerationOf(staged);
    const stagedViolations = violationsOf(staged);

    const baseKeys = new Set(baselineViolations.map(vKey));
    const fresh = stagedViolations.filter((v) => !baseKeys.has(vKey(v)));
    if (fresh.length > 0) {
      return {
        accepted: false,
        baseline_generation: baselineGeneration,
        staged_generation: stagedGeneration,
        new_violations: fresh,
        citation,
      };
    }

    // Accepted: write the staging copy — patched file + staged index. The real tree is untouched.
    const stagedDir = path.join(workspaceRoot, '.lynx-staging', stagedGeneration);
    fs.mkdirSync(path.join(stagedDir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(stagedDir, file), newText);
    const stagedDb = path.join(stagedDir, 'index.db');
    buildOrgIndex(staged, stagedDb);

    // Impact set + §6.4 change classes against the baseline.
    const baseDb = path.join(os.tmpdir(), `lynx-propose-base-${baselineGeneration}.db`);
    writeDeterministic(extractOrg(org), baselineGeneration, baseDb);
    const diff = OrgTools.diff(baseDb, stagedDb);
    const tools = new OrgTools(stagedDb);
    const changedContract = extractOrg(staged).nodes.find((n) => n.kind === 'contract' && n.file === stripModule(file));
    const impact = changedContract ? tools.orgImpactOf(changedContract.id) : undefined;
    tools.close();
    fs.unlinkSync(baseDb);

    return {
      accepted: true,
      baseline_generation: baselineGeneration,
      staged_generation: stagedGeneration,
      changes: 'isError' in (diff as ToolError) ? [] : (diff as { changes: unknown[] }).changes,
      impact: impact && !('isError' in impact) ? impact : undefined,
      staged_dir: stagedDir,
      citation,
    };
  }
}

function vKey(v: Violation): string {
  return `${v.invariant}|${v.node_id}|${v.message}`;
}

function stripModule(file: string): string {
  return file;
}

/** In-memory patch of one source file across the org inputs. */
function patch(org: OrgInputs, file: string, newText: string): OrgInputs {
  return {
    codeowners: org.codeowners,
    modules: org.modules.map((m) => ({
      name: m.name,
      inputs: {
        ...m.inputs,
        template: m.inputs.template.map((f) => (f.path === file ? { ...f, text: newText } : f)),
        manifests: m.inputs.manifests.map((f) => (f.path === file ? { ...f, text: newText } : f)),
      },
    })),
  };
}

/** lint_violations ∪ org_lint_violations over an in-memory-ish staged build. */
function violationsOf(org: OrgInputs): Violation[] {
  const tmp = path.join(os.tmpdir(), `lynx-propose-${process.pid}-${orgGenerationOf(org)}.db`);
  writeDeterministic(extractOrg(org), orgGenerationOf(org), tmp);
  const db = new Database(tmp, { readonly: true });
  try {
    return [
      ...(db.prepare('SELECT * FROM lint_violations').all() as Violation[]),
      ...(db.prepare('SELECT * FROM org_lint_violations').all() as Violation[]),
    ];
  } finally {
    db.close();
    fs.unlinkSync(tmp);
  }
}
