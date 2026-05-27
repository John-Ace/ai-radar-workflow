#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { markdownArchivePath } from './archive-paths.mjs';
import { formatLocalDate, loadJson } from './ai-radar-lib.mjs';
import { loadLocalEnv } from './env.mjs';

const root = process.cwd();
loadLocalEnv(root);
const lockPath = path.join(root, 'runs', 'ai-radar', '.agent-brief.lock');

function main() {
  const lock = acquireLock();
  if (!lock) {
    console.log('[agent-brief] another brief generation is running; skip');
    return;
  }

  try {
    const config = loadJson('configs/ai-radar.json');
    const today = formatLocalDate(new Date());
    const archive = config.archive ?? {};
    const archivePath = markdownArchivePath(
      root,
      archive.briefDir ?? archive.codexBriefDir ?? 'AI 日报库',
      today,
      archive.briefFileSuffix ?? 'AI 日报'
    );

    if (fs.existsSync(archivePath)) {
      console.log(`[agent-brief] today brief exists: ${path.relative(root, archivePath)}`);
      return;
    }

    const prepare = spawnSync('npm', ['run', 'ai:prepare-brief'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    process.stdout.write(prepare.stdout ?? '');
    process.stderr.write(prepare.stderr ?? '');
    if (prepare.status !== 0) {
      console.log('[agent-brief] prepare failed; skip agent generation');
      return;
    }

    const runDir = findLatestRunForDate(config.outputDir ?? 'runs/ai-radar', today);
    if (!runDir) {
      console.log('[agent-brief] no run for today');
      return;
    }
    const statusPath = path.join(runDir, 'status.json');
    const status = loadJson(statusPath);
    if (status.analysisStatus !== 'pending') {
      console.log(`[agent-brief] latest run is ${status.analysisStatus}: ${path.relative(root, runDir)}`);
      return;
    }
    if (status.selectedItems !== 25 || status.selectionTargetItems !== 25) {
      console.log(`[agent-brief] selected candidates not ready: ${status.selectedItems}/${status.selectionTargetItems}`);
      return;
    }

    const analysisInputPath = path.join(runDir, 'analysis-input.md');
    const selectedPath = path.join(runDir, 'selected-results.json');
    const reportPath = path.join(runDir, 'selection-report.md');
    const templatePath = path.join(root, 'templates', 'ai-radar-daily.md');
    const briefPath = path.join(runDir, 'ai-brief.md');
    if (!fs.existsSync(analysisInputPath)) {
      console.log('[agent-brief] analysis-input.md missing');
      return;
    }
    if (fs.existsSync(briefPath)) {
      console.log('[agent-brief] ai-brief.md already exists; marking done');
      markDone(runDir);
      return;
    }

    const promptPath = path.join(runDir, 'agent-brief-prompt.md');
    fs.writeFileSync(promptPath, promptForRun(runDir), 'utf8');

    const command = process.env.AGENT_BRIEF_COMMAND;
    if (!command) {
      console.log('[agent-brief] prepared agent input, but AGENT_BRIEF_COMMAND is not set.');
      console.log(`[agent-brief] prompt: ${path.relative(root, promptPath)}`);
      console.log(`[agent-brief] expected output: ${path.relative(root, briefPath)}`);
      console.log('[agent-brief] Configure AGENT_BRIEF_COMMAND to let your agent generate automatically, or ask your agent to follow the prompt file.');
      return;
    }

    console.log(`[agent-brief] starting agent generation for ${path.relative(root, runDir)}`);
    const result = spawnSync(command, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: true,
      timeout: 45 * 60 * 1000,
      env: {
        ...process.env,
        AI_RADAR_ROOT: root,
        AI_RADAR_RUN_DIR: runDir,
        AI_RADAR_ANALYSIS_INPUT: analysisInputPath,
        AI_RADAR_SELECTED_RESULTS: selectedPath,
        AI_RADAR_SELECTION_REPORT: reportPath,
        AI_RADAR_TEMPLATE: templatePath,
        AI_RADAR_OUTPUT: briefPath,
        AI_RADAR_PROMPT: promptPath,
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.log(`[agent-brief] agent command exited with status ${result.status}`);
      return;
    }

    if (!fs.existsSync(briefPath)) {
      console.log('[agent-brief] agent finished but ai-brief.md is missing');
      return;
    }
    markDone(runDir);
  } finally {
    releaseLock(lock);
  }
}

function acquireLock() {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    return fs.openSync(lockPath, 'wx');
  } catch (err) {
    if (err?.code === 'EEXIST') return null;
    throw err;
  }
}

function releaseLock(fd) {
  fs.closeSync(fd);
  fs.rmSync(lockPath, { force: true });
}

function findLatestRunForDate(outputDir, date) {
  const runsDir = path.resolve(outputDir);
  if (!fs.existsSync(runsDir)) return null;
  const runDirs = fs.readdirSync(runsDir)
    .sort()
    .reverse()
    .map((name) => path.join(runsDir, name))
    .filter((dir) => fs.existsSync(path.join(dir, 'status.json')));

  for (const runDir of runDirs) {
    const status = loadJson(path.join(runDir, 'status.json'));
    if (status.date === date) return runDir;
  }
  return null;
}

function markDone(runDir) {
  const result = spawnSync('npm', ['run', 'ai:mark-brief-done', '--', runDir], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) console.log(`[agent-brief] mark done exited with status ${result.status}`);
}

function promptForRun(runDir) {
  const rel = path.relative(root, runDir);
  return `# AI Radar Daily Brief Agent Task

Generate the AI Radar daily brief for this run only:

${rel}

Read these files:

- ${rel}/analysis-input.md
- ${rel}/selected-results.json
- ${rel}/selection-report.md
- templates/ai-radar-daily.md

Write this file:

- ${rel}/ai-brief.md

Hard requirements:

- Use only collected data and visible sources. Do not invent facts.
- Confirm selected-results.json is 25/25. If it is not, stop and explain.
- The daily brief must contain exactly 25 items.
- Use only fresh candidates from today or yesterday by local calendar date.
- Do not use older content to fill the quota.
- Keep only these sections for each item: 发生了什么, 为什么重要, 我们该关注什么, 今日术语解释, 原始来源.
- Do not add image/media sections.
- Do not write independent sections named 一句话总结, 背后反映的趋势, 对我们有什么用, 行动建议, or 选题建议.
- 发生了什么 uses one list item and should be concise but complete.
- 为什么重要 uses two list items: the first explains why it matters, the second explains what trend it reflects. Do not add subheadings inside those list items.
- 我们该关注什么 uses one list item.
- 今日术语解释 must be plain and easy to understand, with examples or analogies when useful.
- If a source is only a homepage snapshot, candidate link, or secondhand community signal, mark it as 需进一步确认.

Only write ${rel}/ai-brief.md. Do not archive; the workflow archives after generation.`;
}

main();
