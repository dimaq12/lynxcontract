// vsce cannot pack symlinked deps (file:../../graph/core). Dereference the @lynx/core
// symlink into a real copy for packaging, then restore the symlink for development.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const linkPath = path.resolve(__dirname, '..', 'server', 'node_modules', '@lynx', 'core');
const realCore = path.resolve(__dirname, '..', '..', 'graph', 'core');

const wasLink = fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink();
if (wasLink) {
  fs.rmSync(linkPath);
  fs.mkdirSync(linkPath, { recursive: true });
  for (const part of ['package.json', 'out']) {
    fs.cpSync(path.join(realCore, part), path.join(linkPath, part), { recursive: true, dereference: true });
  }
}
try {
  execSync('npx --yes @vscode/vsce package --allow-missing-repository --skip-license', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
} finally {
  if (wasLink) {
    fs.rmSync(linkPath, { recursive: true, force: true });
    fs.symlinkSync(path.relative(path.dirname(linkPath), realCore), linkPath);
  }
}
