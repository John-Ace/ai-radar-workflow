#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './env.mjs';

const root = process.cwd();
loadLocalEnv(root);
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const yes = args.has('--yes') || args.has('-y');

const directories = [
  path.join('runs', 'ai-radar'),
  'logs',
  'opencli 数据爬取库',
  'Codex AI日报库',
];

function main() {
  console.log('# AI Radar Workflow setup');
  console.log(`- Project: ${root}`);
  console.log(`- Platform: ${process.platform}`);
  console.log(`- Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log('');

  checkCommand('node', ['--version'], 'Node.js');
  checkCommand('npm', ['--version'], 'npm');
  checkCommand('opencli', ['--version'], 'OpenCLI', false);
  checkCodexCli();

  for (const dir of directories) ensureDir(path.join(root, dir));
  ensureLocalEnvExample();

  console.log('');
  console.log('Setup complete.');
  console.log('Next: run `npm run ai:fetch-if-needed` to test collection.');
  console.log('Optional automation: run `npm run install:automation -- --dry-run` first, then rerun without --dry-run.');

  if (!dryRun && yes) {
    console.log('');
    console.log('Installing automation because --yes was provided.');
    const result = spawnSync('npm', ['run', 'install:automation'], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
}

function checkCommand(bin, commandArgs, label, required = true) {
  const result = spawnSync(bin, commandArgs, { encoding: 'utf8' });
  const ok = !result.error && result.status === 0;
  const version = ok ? (result.stdout || result.stderr).trim().split(/\r?\n/)[0] : '';
  console.log(`- ${label}: ${ok ? version || 'ok' : 'not found'}`);
  if (required && !ok) process.exitCode = 1;
}

function checkCodexCli() {
  const codexCli = findCodexCli();
  if (!codexCli) {
    console.log('- Codex CLI: not found');
    console.log('  Set CODEX_CLI=/path/to/codex or install Codex CLI before generating briefs.');
    return;
  }
  const result = spawnSync(codexCli, ['--version'], { encoding: 'utf8' });
  const version = result.status === 0 ? (result.stdout || result.stderr).trim().split(/\r?\n/)[0] : 'found';
  console.log(`- Codex CLI: ${version} (${codexCli})`);
}

function findCodexCli() {
  if (process.env.CODEX_CLI && fs.existsSync(process.env.CODEX_CLI)) return process.env.CODEX_CLI;
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, ['codex'], { encoding: 'utf8' });
  const found = result.stdout?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (result.status === 0 && found) return found;
  const macAppCli = '/Applications/Codex.app/Contents/Resources/codex';
  if (process.platform === 'darwin' && fs.existsSync(macAppCli)) return macAppCli;
  return null;
}

function ensureDir(dir) {
  if (dryRun) {
    console.log(`- ensure dir: ${path.relative(root, dir)}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  console.log(`- ensured dir: ${path.relative(root, dir)}`);
}

function ensureLocalEnvExample() {
  const localEnv = path.join(root, '.env.local');
  if (dryRun) {
    console.log('- optional local env: .env.local');
    return;
  }
  if (!fs.existsSync(localEnv)) {
    fs.writeFileSync(localEnv, '# Optional local overrides\n# CODEX_CLI=/absolute/path/to/codex\n', 'utf8');
    console.log('- created: .env.local');
  }
}

main();
