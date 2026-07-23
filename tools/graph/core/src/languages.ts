//@realizes: [contracts/graph#LanguageProfiles]
// Languages are profiles-as-data, not plugins. The parser accepts every marker everywhere
// (heritage v0.2 rule: "tools accept both"); a profile decides what tooling EMITS.

export interface LanguageProfile {
  id: 'jvm' | 'go' | 'python' | 'rust';
  /** Source extensions this profile owns (without the .lynx stub infix). */
  extensions: string[];
  /** The marker codegen/snippets emit for this language. */
  marker: '//@' | '#@';
  lineComment: '//' | '#';
}

export const LANGUAGES: LanguageProfile[] = [
  { id: 'jvm', extensions: ['.kt', '.kts', '.java'], marker: '//@', lineComment: '//' },
  { id: 'go', extensions: ['.go'], marker: '//@', lineComment: '//' },
  { id: 'python', extensions: ['.py'], marker: '#@', lineComment: '#' },
  { id: 'rust', extensions: ['.rs'], marker: '//@', lineComment: '//' },
];

export function profileFor(path: string): LanguageProfile | undefined {
  const clean = path.replace(/\.lynx(?=\.|$)/, '');
  return LANGUAGES.find((l) => l.extensions.some((e) => clean.endsWith(e)));
}

/** Every source extension across profiles, for scanners: kt|kts|java|go|py */
export const SOURCE_EXT_RE = /\.(kt|kts|java|go|py|rs)$/;
