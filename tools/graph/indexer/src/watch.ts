//@realizes: [contracts/graph#WatchMode]
// Live index: @parcel/watcher over every source dir, debounced into the incremental builder.
import watcher from '@parcel/watcher';
import { BuildResult } from './build';
import { IncrementalOrgBuilder } from './incremental';
import { watchRoots } from './config';

export interface WatchHandle {
  close(): Promise<void>;
}

export async function startWatch(
  configPath: string,
  outFile: string,
  onRebuild: (result: BuildResult) => void,
  opts?: { cacheDir?: string; debounceMs?: number },
): Promise<WatchHandle> {
  const builder = new IncrementalOrgBuilder(configPath, outFile, opts?.cacheDir);
  onRebuild(builder.build());

  let timer: NodeJS.Timeout | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        onRebuild(builder.build());
      } catch (e) {
        process.stderr.write(`lynx-graph watch: rebuild failed: ${(e as Error).message}\n`);
      }
    }, opts?.debounceMs ?? 150);
  };

  const subscriptions = await Promise.all(
    watchRoots(configPath).map((dir) =>
      watcher.subscribe(dir, (err) => {
        if (err) {
          process.stderr.write(`lynx-graph watch: ${err.message}\n`);
          return;
        }
        rebuild();
      }, { ignore: ['**/node_modules/**', '**/.git/**', '**/out/**'] }),
    ),
  );

  return {
    async close() {
      clearTimeout(timer);
      await Promise.all(subscriptions.map((s) => s.unsubscribe()));
    },
  };
}
