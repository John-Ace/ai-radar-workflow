#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { markdownArchivePath } from './archive-paths.mjs';
import { formatLocalDate, loadJson } from './ai-radar-lib.mjs';
import { loadLocalEnv } from './env.mjs';

const root = process.cwd();
loadLocalEnv(root);

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const configPath = args.find((arg) => !arg.startsWith('--')) ?? 'configs/ai-radar.json';
  const config = loadJson(configPath);
  const today = formatLocalDate(new Date());
  const archive = config.archive ?? {};
  const dataPath = markdownArchivePath(
    root,
    archive.opencliDataDir ?? 'opencli 数据爬取库',
    today,
    archive.dataFileSuffix ?? '数据爬取'
  );
  const latestToday = findLatestStatusForDate(config.outputDir ?? 'runs/ai-radar', today);

  if (!force && fs.existsSync(dataPath) && latestToday?.collectionStatus === 'done') {
    console.log(`[ai-radar] today archive exists: ${path.relative(root, dataPath)}`);
    return;
  }

  if (latestToday && latestToday.collectionStatus !== 'done') {
    console.log(`[ai-radar] today latest run is ${latestToday.collectionStatus}; retrying`);
  } else {
    console.log(`[ai-radar] today archive missing: ${path.relative(root, dataPath)}`);
  }
  if (dryRun) {
    console.log('[ai-radar] dry run: fetch would start');
    return;
  }
  console.log('[ai-radar] starting fetch');
  const result = spawnSync(process.execPath, ['scripts/fetch-ai-radar.mjs', configPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

main();

function findLatestStatusForDate(outputDir, date) {
  const runsDir = path.resolve(outputDir);
  if (!fs.existsSync(runsDir)) return null;
  const statusPaths = fs.readdirSync(runsDir)
    .sort()
    .reverse()
    .map((name) => path.join(runsDir, name, 'status.json'))
    .filter((file) => fs.existsSync(file));

  for (const statusPath of statusPaths) {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (status.date === date) return status;
  }
  return null;
}
