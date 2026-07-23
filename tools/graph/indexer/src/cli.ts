// CLI face of the indexer: lynx-index --template <dir> --manifest <file> [--generated <dir>] [--reports <dir>] --out <file>
import * as path from 'node:path';
import { buildIndex, loadInputs } from './build';
import { snapshotDirFor, writeSnapshot } from './snapshots';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const templateDir = arg('template');
const config = arg('config');
const out = arg('out');
if ((!templateDir && !config) || !out) {
  process.stderr.write('usage: lynx-index --template <dir> [--manifest <file>] [--generated <dir>] [--reports <dir>] --out <file>\n' +
    '       lynx-index --config <lynx-sources.json> --out <file> [--watch] [--cache <dir>] [--snapshot] [--snapshot-dir <dir>]\n');
  process.exit(2);
}

if (config) {
  // Spec §6.4: --snapshot registers each build in the content-addressed registry.
  const snapshot = process.argv.includes('--snapshot') || arg('snapshot-dir') !== undefined;
  const snapshotDir = arg('snapshot-dir') ?? snapshotDirFor(config);
  const report = (r: { counts: { nodes: number; edges: number }; generation: string }) => {
    process.stderr.write(`indexed ${r.counts.nodes} nodes / ${r.counts.edges} edges -> ${out} (generation ${r.generation})\n`);
    if (snapshot) {
      const snap = writeSnapshot(path.resolve(out!), r.generation, snapshotDir);
      process.stderr.write(`snapshot ${snap.written ? 'registered' : 'already registered'}: ${snap.path}\n`);
    }
  };
  if (process.argv.includes('--watch')) {
    // Long-running: initial build + rebuild on change.
    import('./watch').then(({ startWatch }) =>
      startWatch(path.resolve(config), path.resolve(out!), report, { cacheDir: arg('cache') }),
    );
  } else {
    const { IncrementalOrgBuilder } = require('./incremental') as typeof import('./incremental');
    report(new IncrementalOrgBuilder(path.resolve(config), path.resolve(out!), arg('cache')).build());
  }
} else {
  singleModule();
}

function singleModule(): void {
  const root = arg('root') ?? path.dirname(path.resolve(templateDir!));
  const result = buildIndex({
    outFile: path.resolve(out!),
    inputs: loadInputs({
      root,
      templateDir: path.resolve(templateDir!),
      manifestFiles: arg('manifest') ? [path.resolve(arg('manifest')!)] : [],
      generatedDir: arg('generated') ? path.resolve(arg('generated')!) : undefined,
      reportsDir: arg('reports') ? path.resolve(arg('reports')!) : undefined,
    }),
  });
  process.stderr.write(`indexed ${result.counts.nodes} nodes / ${result.counts.edges} edges -> ${result.outFile} (generation ${result.generation})\n`);
}
