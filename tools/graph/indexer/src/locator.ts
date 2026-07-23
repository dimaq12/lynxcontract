//@realizes: [contracts/graph#MethodLocator]
// Declaration locators: regex (default, zero-dep) and web-tree-sitter WASM (robust path
// per research/tech-stack-research-2026-07.md §3). Locator identity feeds the generation
// hash — indexes built with different locators must not claim byte-equality.

export interface MethodDecl {
  name: string;
  line: number;
}

export type MethodLocator = {
  id: string;
  locate(path: string, text: string): MethodDecl[];
};

const DECL_RES: { ext: RegExp; re: RegExp }[] = [
  { ext: /\.(kt|kts)$/, re: /^\s*(?:override\s+)?(?:public\s+|private\s+|internal\s+)?fun\s+([A-Za-z_]\w*)/ },
  { ext: /\.go$/, re: /^func\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)\s*\(/ },
  { ext: /\.py$/, re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/ },
  { ext: /\.rs$/, re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/ },
  { ext: /\.java$/, re: /^\s*(?:public|protected|private)?\s*(?:static\s+)?[\w<>,.[\]]+\s+([a-z]\w*)\s*\(/ },
];

export const regexLocator: MethodLocator = {
  id: 'regex@2',
  locate(path: string, text: string): MethodDecl[] {
    const entry = DECL_RES.find((d) => d.ext.test(path)) ?? DECL_RES[0];
    const out: MethodDecl[] = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = entry.re.exec(lines[i]);
      if (m) out.push({ name: m[1], line: i });
    }
    return out;
  },
};

/**
 * Tree-sitter WASM locator for Kotlin + Java. Returns undefined when the wasm packages are
 * not installed — callers fall back to regexLocator and the generation hash records which.
 */
export async function createTreeSitterLocator(): Promise<MethodLocator | undefined> {
  let TS: typeof import('web-tree-sitter');
  try {
    TS = require('web-tree-sitter');
  } catch {
    return undefined;
  }
  const { Parser, Language } = TS;
  await Parser.init();

  const load = async (pkgWasm: string) => {
    try {
      return await Language.load(require.resolve(pkgWasm));
    } catch {
      return undefined;
    }
  };
  const kotlin = await load('@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm');
  const java = await load('tree-sitter-java/tree-sitter-java.wasm');
  const go = await load('tree-sitter-go/tree-sitter-go.wasm');
  const python = await load('tree-sitter-python/tree-sitter-python.wasm');
  const rust = await load('tree-sitter-rust/tree-sitter-rust.wasm');
  if (!kotlin && !java && !go && !python && !rust) return undefined;

  const declTypes = new Set(['function_declaration', 'method_declaration', 'function_definition', 'function_item']);

  return {
    id: `tree-sitter@kotlin:${kotlin ? 1 : 0},java:${java ? 1 : 0},go:${go ? 1 : 0},python:${python ? 1 : 0},rust:${rust ? 1 : 0}`,
    locate(path: string, text: string): MethodDecl[] {
      const lang = /\.(kt|kts)$/.test(path) ? kotlin
        : /\.java$/.test(path) ? java
        : /\.go$/.test(path) ? go
        : /\.py$/.test(path) ? python
        : /\.rs$/.test(path) ? rust
        : undefined;
      if (!lang) return regexLocator.locate(path, text);
      const parser = new Parser();
      parser.setLanguage(lang);
      const tree = parser.parse(text);
      const out: MethodDecl[] = [];
      const walk = (node: import('web-tree-sitter').Node) => {
        if (declTypes.has(node.type)) {
          const nameNode = node.childForFieldName?.('name')
            ?? node.children.find((c) => c !== null && (c.type === 'simple_identifier' || c.type === 'identifier'));
          if (nameNode) out.push({ name: nameNode.text.replace(/^`|`$/g, ''), line: node.startPosition.row });
        }
        for (const c of node.children) if (c) walk(c);
      };
      if (tree) {
        walk(tree.rootNode);
        tree.delete();
      }
      parser.delete();
      return out.sort((a, b) => a.line - b.line || (a.name < b.name ? -1 : 1));
    },
  };
}
