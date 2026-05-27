#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { markdownArchivePath } from './archive-paths.mjs';
import { formatLocalDate, loadJson } from './ai-radar-lib.mjs';
import { loadLocalEnv } from './env.mjs';

const root = process.cwd();
loadLocalEnv(root);
const lockPath = path.join(root, 'runs', 'ai-radar', '.codex-brief.lock');

function main() {
  const lock = acquireLock();
  if (!lock) {
    console.log('[codex-brief] another brief generation is running; skip');
    return;
  }

  try {
    const config = loadJson('configs/ai-radar.json');
    const today = formatLocalDate(new Date());
    const archive = config.archive ?? {};
    const archivePath = markdownArchivePath(
      root,
      archive.codexBriefDir ?? 'Codex AI日报库',
      today,
      archive.briefFileSuffix ?? 'AI 日报'
    );

    if (fs.existsSync(archivePath)) {
      console.log(`[codex-brief] today brief exists: ${path.relative(root, archivePath)}`);
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
      console.log('[codex-brief] prepare failed; skip Codex generation');
      return;
    }

    const runDir = findLatestRunForDate(config.outputDir ?? 'runs/ai-radar', today);
    if (!runDir) {
      console.log('[codex-brief] no run for today');
      return;
    }
    const statusPath = path.join(runDir, 'status.json');
    const status = loadJson(statusPath);
    if (status.analysisStatus !== 'pending') {
      console.log(`[codex-brief] latest run is ${status.analysisStatus}: ${path.relative(root, runDir)}`);
      return;
    }
    if (status.selectedItems !== 25 || status.selectionTargetItems !== 25) {
      console.log(`[codex-brief] selected candidates not ready: ${status.selectedItems}/${status.selectionTargetItems}`);
      return;
    }
    if (!fs.existsSync(path.join(runDir, 'analysis-input.md'))) {
      console.log('[codex-brief] analysis-input.md missing');
      return;
    }
    if (fs.existsSync(path.join(runDir, 'ai-brief.md'))) {
      console.log('[codex-brief] ai-brief.md already exists; marking done');
      markDone(runDir);
      return;
    }

    const codexCli = findCodexCli();
    if (!codexCli) {
      console.log('[codex-brief] Codex CLI not found. Set CODEX_CLI or install Codex CLI before generating briefs.');
      return;
    }

    console.log(`[codex-brief] starting Codex generation for ${path.relative(root, runDir)}`);
    const codex = spawnSync(codexCli, [
      'exec',
      '-C', root,
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '-m', 'gpt-5.2',
      promptForRun(runDir),
    ], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 45 * 60 * 1000,
    });
    if (codex.error) throw codex.error;
    if (codex.status !== 0) {
      console.log(`[codex-brief] Codex exited with status ${codex.status}`);
      return;
    }

    if (!fs.existsSync(path.join(runDir, 'ai-brief.md'))) {
      console.log('[codex-brief] Codex finished but ai-brief.md is missing');
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
  if (result.status !== 0) console.log(`[codex-brief] mark done exited with status ${result.status}`);
}

function promptForRun(runDir) {
  const rel = path.relative(root, runDir);
  return `在 ${root} 项目中生成 AI Radar 日报。只处理这个 run：${rel}。

读取 ${rel}/analysis-input.md、${rel}/selected-results.json、${rel}/selection-report.md、templates/ai-radar-daily.md。

硬性要求：
- 只基于采集数据和可见来源，不要编造。
- selected-results.json 必须是 25/25；如果不是，停止并说明。
- 生成 ${rel}/ai-brief.md。
- 日报必须正好 25 条，且只能使用采集当天或前一天的新鲜候选。
- 每条只保留：发生了什么、为什么重要、我们该关注什么、今日术语解释、原始来源；不要写配图/媒体栏目。
- 不要写“一句话总结”“背后反映的趋势”“对我们有什么用”“行动建议”“选题建议”这些独立栏目。
- “发生了什么”用一条黑点写，凝练但相对完整地交代事件全貌。
- “为什么重要”必须用两个黑点列表分开写：第一条说明为什么重要，第二条说明反映了什么趋势；不要在黑点后再加独立小标题。
- “我们该关注什么”用一条黑点写。
- “今日术语解释”要通俗清晰，可以举例或打比方。
- 若来源只是网页快照、候选链接或社区二手信息，必须标注“需进一步确认”。

只写文件，不要归档；归档由外层脚本完成。`;
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

main();
