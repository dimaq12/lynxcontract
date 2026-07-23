//@realizes: [contracts/graph#OrgConfig]
// lynx-sources.json — the single declared home for what makes up a workspace (§20.8-7).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadInputs } from './build';
import { OrgInputs } from './org';

export interface SourcesConfig {
  modules: {
    name: string;
    template: string;
    manifests?: string[];
    generated?: string;
    reports?: string;
  }[];
  codeowners?: string;
}

export function loadOrgConfig(configPath: string): OrgInputs {
  const abs = path.resolve(configPath);
  const root = path.dirname(abs);
  const cfg = JSON.parse(fs.readFileSync(abs, 'utf8')) as SourcesConfig;
  const at = (p: string) => path.resolve(root, p);

  const modules = cfg.modules.map((m) => {
    if (!fs.existsSync(at(m.template))) throw new Error(`module '${m.name}': template dir not found: ${m.template}`);
    return {
      name: m.name,
      // module root = the template dir's parent, workspace-relative (CODEOWNERS glob target)
      root: path.posix.normalize(path.dirname(m.template)),
      inputs: loadInputs({
        root,
        templateDir: at(m.template),
        manifestFiles: (m.manifests ?? []).map(at),
        generatedDir: m.generated ? at(m.generated) : undefined,
        reportsDir: m.reports ? at(m.reports) : undefined,
      }),
    };
  });

  return {
    modules,
    codeowners: cfg.codeowners
      ? { path: cfg.codeowners, text: fs.readFileSync(at(cfg.codeowners), 'utf8') }
      : undefined,
  };
}

/** Every directory the watcher must observe for this config. */
export function watchRoots(configPath: string): string[] {
  const abs = path.resolve(configPath);
  const root = path.dirname(abs);
  const cfg = JSON.parse(fs.readFileSync(abs, 'utf8')) as SourcesConfig;
  const at = (p: string) => path.resolve(root, p);
  const dirs = new Set<string>();
  for (const m of cfg.modules) {
    dirs.add(at(m.template));
    for (const mf of m.manifests ?? []) dirs.add(path.dirname(at(mf)));
    if (m.generated) dirs.add(at(m.generated));
    if (m.reports) dirs.add(at(m.reports));
  }
  if (cfg.codeowners) dirs.add(path.dirname(at(cfg.codeowners)));
  return [...dirs].filter((d) => fs.existsSync(d)).sort();
}
