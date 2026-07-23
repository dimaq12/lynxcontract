//@realizes: [contracts/graph#IncrementalBuild]
// Shard-per-module incremental rebuild (§4/§6). The cache is an optimization, never a
// semantic: merged output must byte-equal a from-scratch build.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generationOf, writeDeterministic, BuildResult } from './build';
import { extract, Extraction } from './extract';
import { extractOrgCore, orgGenerationOf, OrgInputs, ModuleInput } from './org';
import { loadOrgConfig } from './config';

export interface BuildStats {
  extracted: string[];
  cached: string[];
}

export class IncrementalOrgBuilder {
  private memory = new Map<string, { generation: string; extraction: Extraction }>();
  stats: BuildStats = { extracted: [], cached: [] };

  constructor(
    private configPath: string,
    private outFile: string,
    private cacheDir?: string,
    private locator?: import('./locator').MethodLocator,
  ) {}

  build(): BuildResult {
    const org = loadOrgConfig(this.configPath);
    if (this.locator) for (const m of org.modules) m.inputs.locator = this.locator;
    this.stats = { extracted: [], cached: [] };

    const shards = new Map(org.modules.map((m) => [m.name, this.shardOf(m)]));
    // Same merge implementation as a full build — shards only swap the per-module extract.
    const extraction = extractOrgCore(org, (m) => shards.get(m.name) ?? extract(m.inputs));
    const result = writeDeterministic(extraction, orgGenerationOf(org), this.outFile);
    this.prune();
    return result;
  }

  private shardOf(m: ModuleInput): Extraction {
    const generation = generationOf(m.inputs);
    const mem = this.memory.get(m.name);
    if (mem && mem.generation === generation) {
      this.stats.cached.push(m.name);
      return mem.extraction;
    }
    const diskFile = this.diskFile(m.name, generation);
    if (diskFile && fs.existsSync(diskFile)) {
      const extraction = JSON.parse(fs.readFileSync(diskFile, 'utf8')) as Extraction;
      this.memory.set(m.name, { generation, extraction });
      this.stats.cached.push(m.name);
      return extraction;
    }
    const extraction = extract(m.inputs);
    this.memory.set(m.name, { generation, extraction });
    if (diskFile) {
      fs.mkdirSync(path.dirname(diskFile), { recursive: true });
      fs.writeFileSync(diskFile, JSON.stringify(extraction));
    }
    this.stats.extracted.push(m.name);
    return extraction;
  }

  private diskFile(name: string, generation: string): string | undefined {
    return this.cacheDir ? path.join(this.cacheDir, `${name}-${generation}.json`) : undefined;
  }

  /** Drop disk-cache entries whose generation is no longer current. */
  private prune(): void {
    if (!this.cacheDir || !fs.existsSync(this.cacheDir)) return;
    const live = new Set([...this.memory.entries()].map(([n, v]) => `${n}-${v.generation}.json`));
    for (const f of fs.readdirSync(this.cacheDir)) {
      if (f.endsWith('.json') && !live.has(f)) fs.unlinkSync(path.join(this.cacheDir, f));
    }
  }
}

