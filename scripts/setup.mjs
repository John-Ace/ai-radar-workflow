#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectAgentCommand } from './agent-detection.mjs';
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
  'AI 日报库',
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
  checkAgentCommand();

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

function checkAgentCommand() {
  if (!process.env.AGENT_BRIEF_COMMAND) {
    const detected = detectAgentCommand();
    if (detected) {
      console.log(`- Daily brief agent: ${detected.label} (${detected.source})`);
      console.log('  The workflow will use this agent automatically unless the user overrides it.');
      return;
    }
    console.log('- Daily brief agent: not detected');
    console.log('  Install a supported agent CLI, or add a custom command in .env.local.');
    return;
  }
  console.log(`- Daily brief agent: custom command (${process.env.AGENT_BRIEF_COMMAND})`);
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
    fs.writeFileSync(localEnv, '# Optional local overrides\n# AI_RADAR_AGENT=auto\n# AGENT_BRIEF_COMMAND=your-agent-command-that-writes-$AI_RADAR_OUTPUT\n', 'utf8');
    console.log('- created: .env.local');
  }
}

main();
