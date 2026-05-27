#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const runsDir = path.join(root, 'runs', 'ai-radar');
const config = readOptionalJson(path.join(root, 'configs', 'ai-radar.json'));
const logPath = resolveProjectPath(config.automation?.logPath ?? path.join('logs', 'ai-radar-fetch.log'));
const errLogPath = resolveProjectPath(config.automation?.errLogPath ?? path.join('logs', 'ai-radar-fetch.err.log'));

function main() {
  const health = buildHealthReport({
    runsDir,
    logPath,
    errLogPath,
    now: new Date(),
  });

  printHealth(health);
  if (health.status === 'bad') process.exitCode = 1;
}

export function buildHealthReport({ runsDir, logPath, errLogPath, now = new Date() }) {
  const latestRunDir = findLatestRun(runsDir);
  if (!latestRunDir) {
    return {
      status: 'bad',
      problems: ['没有找到 AI Radar run'],
      warnings: [],
      latestRun: null,
      logs: readLogSummary(logPath, errLogPath),
    };
  }

  const statusPath = path.join(latestRunDir, 'status.json');
  const status = readJson(statusPath);
  const selectionPath = path.join(latestRunDir, 'selected-results.json');
  const analysisInputPath = path.join(latestRunDir, 'analysis-input.md');
  const briefPath = path.join(latestRunDir, 'ai-brief.md');
  const logs = readLogSummary(logPath, errLogPath);
  const problems = [];
  const warnings = [];

  if (status.collectionStatus !== 'done') problems.push(`采集未完全成功：${status.collectionStatus}`);
  if (status.failedSources > 0) problems.push(`失败源：${status.failedSources}`);
  if (!fs.existsSync(selectionPath)) problems.push('缺少 selected-results.json');
  if ((status.selectedItems ?? 0) < (status.selectionTargetItems ?? 20)) warnings.push(`候选数量低于目标：${status.selectedItems ?? 0}/${status.selectionTargetItems ?? 20}`);
  if (status.analysisStatus === 'pending' && !fs.existsSync(analysisInputPath)) warnings.push('日报待分析，但缺少 analysis-input.md');
  if (status.analysisStatus === 'done' && !fs.existsSync(briefPath)) problems.push('状态显示 done，但缺少 ai-brief.md');

  const generatedAt = new Date(status.generatedAt);
  if (!Number.isNaN(generatedAt.getTime())) {
    const ageHours = (now.getTime() - generatedAt.getTime()) / 36e5;
    if (ageHours > 30) warnings.push(`最新 run 已超过 30 小时：${ageHours.toFixed(1)}h`);
  }

  if (logs.errBytes > 0) warnings.push(`错误日志非空：${logs.errBytes} bytes`);
  if (logs.lastRun && !path.basename(latestRunDir).includes(logs.lastRun)) warnings.push(`日志最后记录 run=${logs.lastRun}，最新目录=${path.basename(latestRunDir)}`);

  return {
    status: problems.length ? 'bad' : warnings.length ? 'warn' : 'ok',
    problems,
    warnings,
    latestRun: {
      dir: latestRunDir,
      id: path.basename(latestRunDir),
      status,
      hasSelection: fs.existsSync(selectionPath),
      hasAnalysisInput: fs.existsSync(analysisInputPath),
      hasBrief: fs.existsSync(briefPath),
    },
    logs,
  };
}

function printHealth(health) {
  console.log(`# AI Radar Health: ${health.status.toUpperCase()}`);
  console.log('');

  if (!health.latestRun) {
    console.log('- 最新 run：无');
  } else {
    const run = health.latestRun;
    const status = run.status;
    console.log(`- 最新 run：${path.relative(root, run.dir)}`);
    console.log(`- 采集状态：${status.collectionStatus}`);
    console.log(`- 分析状态：${status.analysisStatus}`);
    console.log(`- 成功源：${status.okSources}/${status.totalSources}`);
    console.log(`- 原始条目：${status.totalItems}`);
    console.log(`- 日报候选：${status.selectedItems ?? 0}/${status.selectionTargetItems ?? '?'}`);
    console.log(`- selection：${run.hasSelection ? 'yes' : 'no'}`);
    console.log(`- analysis-input：${run.hasAnalysisInput ? 'yes' : 'no'}`);
    console.log(`- ai-brief：${run.hasBrief ? 'yes' : 'no'}`);
  }

  console.log(`- 自动任务日志最后 run：${health.logs.lastRun ?? '未识别'}`);
  console.log(`- 错误日志大小：${health.logs.errBytes} bytes`);

  if (health.problems.length) {
    console.log('');
    console.log('## Problems');
    for (const problem of health.problems) console.log(`- ${problem}`);
  }
  if (health.warnings.length) {
    console.log('');
    console.log('## Warnings');
    for (const warning of health.warnings) console.log(`- ${warning}`);
  }
}

function findLatestRun(dir) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((entry) => fs.existsSync(path.join(entry, 'status.json')))
    .sort()
    .reverse()[0] ?? null;
}

function readLogSummary(logPath, errLogPath) {
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  const runs = [...log.matchAll(/\[ai-radar\] run: runs\/ai-radar\/([0-9-]+)/g)].map((match) => match[1]);
  return {
    lastRun: runs.at(-1) ?? null,
    errBytes: fs.existsSync(errLogPath) ? fs.statSync(errLogPath).size : 0,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readOptionalJson(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveProjectPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
