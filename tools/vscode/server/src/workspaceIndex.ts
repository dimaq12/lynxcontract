//@realizes: [contracts/server#WorkspaceIndex]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseDocument, ParsedFile, walkEntries, parseListValue, Block } from '@lynx/core';

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'out', 'target', 'dist', '.gradle', '.idea']);
const SCAN_EXT = /\.(kt|kts|java|ts|go|py|rs|md|lynx)$/;

export interface ContractInfo {
  /** Contract name as written after `//@contract:`. */
  name: string;
  uri: string;
  line: number;
  block: Block;
  realizedBy: string[];
}

export class WorkspaceIndex {
  private cache = new Map<string, { mtimeMs: number; parsed: ParsedFile }>();
  private roots: string[] = [];

  scan(folderUris: string[]): void {
    this.roots = folderUris.map((u) => (u.startsWith('file://') ? fileURLToPath(u) : u));
    for (const root of this.roots) this.walk(root, 0);
  }

  private walk(dir: string, depth: number): void {
    if (depth > 12) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) this.walk(full, depth + 1);
      } else if (SCAN_EXT.test(e.name)) {
        this.refreshPath(full);
      }
    }
  }

  refreshPath(fsPath: string): void {
    const uri = pathToFileURL(fsPath).toString();
    try {
      const stat = fs.statSync(fsPath);
      const cached = this.cache.get(uri);
      if (cached && cached.mtimeMs === stat.mtimeMs) return;
      const text = fs.readFileSync(fsPath, 'utf8');
      if (!text.includes('//@') && !/\.lynx(\.|$)/.test(fsPath)) {
        this.cache.delete(uri);
        return;
      }
      this.cache.set(uri, { mtimeMs: stat.mtimeMs, parsed: parseDocument(text, uri) });
    } catch {
      this.cache.delete(uri);
    }
  }

  /** Called with live editor content (didChange) — overrides the disk cache. */
  refreshContent(uri: string, text: string): ParsedFile {
    const parsed = parseDocument(text, uri);
    this.cache.set(uri, { mtimeMs: -1, parsed });
    return parsed;
  }

  remove(uri: string): void {
    this.cache.delete(uri);
  }

  get(uri: string): ParsedFile | undefined {
    return this.cache.get(uri)?.parsed;
  }

  files(): ParsedFile[] {
    return [...this.cache.values()].map((c) => c.parsed);
  }

  /** All named //@contract: blocks in the workspace. */
  contracts(): ContractInfo[] {
    const out: ContractInfo[] = [];
    for (const file of this.files()) {
      for (const block of file.blocks) {
        if (block.kind !== 'contract' || !block.name) continue;
        const realizedBy: string[] = [];
        for (const e of walkEntries(block.entries)) {
          if (e.key === 'realizedBy' && e.value) {
            realizedBy.push(...parseListValue(e.value, 0).map((i) => i.item));
          }
        }
        out.push({ name: block.name, uri: file.uri, line: block.startLine, block, realizedBy });
      }
    }
    return out;
  }

  /**
   * Resolve `path#contract` (or bare path / bare contract-name) suffix-wise,
   * extension- and .lynx-insensitively (§7.1: `contracts/register-device#handle`).
   */
  resolveAnchor(ref: string): { uri: string; line: number } | undefined {
    const hash = ref.indexOf('#');
    const refPath = hash >= 0 ? ref.slice(0, hash) : ref;
    const refName = hash >= 0 ? ref.slice(hash + 1) : undefined;

    const candidates = this.contracts().filter((c) => {
      if (refName && !matchesNameSuffix(c.name, refName)) return false;
      if (refPath && !matchesPathSuffix(c.uri, refPath)) return false;
      return true;
    });
    if (candidates.length > 0) return { uri: candidates[0].uri, line: candidates[0].line };

    // Bare-path refs (no #name) may target files with unnamed blocks.
    if (refPath && !refName) {
      for (const file of this.files()) {
        if (matchesPathSuffix(file.uri, refPath)) return { uri: file.uri, line: 0 };
      }
    }
    return undefined;
  }

  /** Resolve a plain file reference (realizedBy / graph files) against disk, relative to fromUri's tree. */
  resolveFile(ref: string, fromUri: string): string | undefined {
    const from = fileURLToPath(fromUri);
    const seeds = new Set<string>([path.dirname(from), ...this.roots]);
    for (const seed of seeds) {
      let dir: string | undefined = seed;
      for (let i = 0; i < 8 && dir; i++) {
        const candidate = path.resolve(dir, ref);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        dir = parent === dir ? undefined : parent;
      }
    }
    return undefined;
  }

  /**
   * Registered fill tokens (§20.2): union of {{Token}} occurrences in any file
   * whose name or content marks it as the fill registry. undefined ⇒ no registry
   * in this workspace, token-closure lint stays silent.
   */
  fillRegistry(): Set<string> | undefined {
    let found = false;
    const tokens = new Set<string>();
    for (const [uri, { parsed }] of this.cache) {
      const base = path.basename(uri).toLowerCase();
      if (!base.includes('fill-registry') && !base.includes('fill_registry')) continue;
      found = true;
      for (const f of parsed.fills) tokens.add(f.token);
    }
    return found ? tokens : undefined;
  }
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/\.lynx(?=\.|$)/, '').replace(/\.(kt|kts|java|md)$/, '');
}

export function matchesPathSuffix(uri: string, ref: string): boolean {
  const a = normalize(decodeURIComponent(uri.replace(/^file:\/\//, '')));
  const b = normalize(ref);
  return a === b || a.endsWith('/' + b) || a.endsWith(b);
}

function matchesNameSuffix(name: string, ref: string): boolean {
  return name === ref || name.endsWith('.' + ref);
}
