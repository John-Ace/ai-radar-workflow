#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildSelection, writeSelectionFiles } from './filter-ai-radar.mjs';

const root = process.cwd();
const runsDir = path.join(root, 'runs', 'ai-radar');

function main() {
  const runDir = process.argv[2] ? path.resolve(process.argv[2]) : findLatestRun();
  if (!runDir) {
    console.log('[ai-brief] no AI radar run found');
    return;
  }

  const statusPath = path.join(runDir, 'status.json');
  const rawPath = path.join(runDir, 'raw', 'all-results.json');
  const status = readJson(statusPath);
  if (status.analysisStatus !== 'pending') {
    console.log(`[ai-brief] latest run is ${status.analysisStatus}: ${path.relative(root, runDir)}`);
    return;
  }
  const all = readJson(rawPath);
  const selection = ensureSelection(runDir, all, status);
  if (selection.selectedItems < selection.config.targetItems) {
    console.error(
      `[ai-brief] fresh selected candidates insufficient: ${selection.selectedItems}/${selection.config.targetItems}. ` +
      'Expand or fix collection sources before generating the daily brief.'
    );
    process.exitCode = 1;
    return;
  }
  const markdown = buildAnalysisInput(status, all, selection);
  const outPath = path.join(runDir, 'analysis-input.md');
  fs.writeFileSync(outPath, markdown, 'utf8');

  console.log(`[ai-brief] pending run: ${path.relative(root, runDir)}`);
  console.log(`[ai-brief] selected: ${selection.selectedItems}/${selection.config.targetItems}`);
  console.log(`[ai-brief] input: ${path.relative(root, outPath)}`);
  console.log(`[ai-brief] target: ${path.relative(root, path.join(runDir, 'ai-brief.md'))}`);
  if (status.pendingBriefArchivePath) console.log(`[ai-brief] archive target: ${path.relative(root, status.pendingBriefArchivePath)}`);
}

function findLatestRun() {
  if (!fs.existsSync(runsDir)) return null;
  return fs.readdirSync(runsDir)
    .map((name) => path.join(runsDir, name))
    .filter((dir) => fs.existsSync(path.join(dir, 'status.json')))
    .sort()
    .reverse()[0] ?? null;
}

function ensureSelection(runDir, all, status) {
  const selectionPath = path.join(runDir, 'selected-results.json');
  if (fs.existsSync(selectionPath)) return readJson(selectionPath);
  const selection = buildSelection(all, { referenceTime: status.generatedAt });
  writeSelectionFiles(runDir, selection);
  return selection;
}

function buildAnalysisInput(status, all, selection) {
  const lines = [];
  lines.push(`# AI 日报分析输入｜${status.date}`);
  lines.push('');
  lines.push('## 任务');
  lines.push('');
  lines.push('请基于下面 OpenCLI 采集结果，按照 `templates/ai-radar-daily.md` 生成 `ai-brief.md`。');
  lines.push('要求：发生了什么用一个列表项写，凝练但相对完整地交代事件全貌；为什么重要必须用两个列表项分开写，第一条说明为什么重要，第二条说明反映了什么趋势；我们该关注什么用一个列表项写；今日术语解释要通俗、清晰，可以举例或打比方；不要写配图/媒体栏目。不要编造来源中没有的信息。');
  lines.push('日报必须生成 25 条，且只能使用当天/前一天的新鲜候选；不要使用更早内容补齐。若精选候选不足 25 条，说明采集源不足，需要先扩充或修复采集源。原始数据只作为查证和补充背景。');
  lines.push('');
  lines.push('## 采集状态');
  lines.push('');
  lines.push(`- 采集状态：${status.collectionStatus}`);
  lines.push(`- 成功源：${status.okSources}/${status.totalSources}`);
  lines.push(`- 原始条目：${status.totalItems}`);
  lines.push(`- 日报候选：${selection.selectedItems}/${selection.config.targetItems}`);
  lines.push(`- 目标文件：${status.pendingBriefPath}`);
  if (status.pendingBriefArchivePath) lines.push(`- 日报库文件：${status.pendingBriefArchivePath}`);
  lines.push('');

  lines.push('## 精选候选信息');
  lines.push('');
  lines.push('这些内容已经经过规则去重、打分和来源多样性控制。请从中生成日报，不需要覆盖所有原始条目。');
  lines.push('');
  const byGroup = groupBy(selection.selected ?? [], (entry) => entry.group ?? '未分组');
  for (const [group, groupResults] of Object.entries(byGroup)) {
    lines.push(`## ${group}`);
    lines.push('');
    for (const entry of groupResults) {
      lines.push(formatSelectedEntry(entry));
      lines.push('');
    }
  }

  lines.push('## 失败源');
  lines.push('');
  const failed = (all.results ?? []).filter((result) => !result.ok);
  if (failed.length === 0) {
    lines.push('- 无');
  } else {
    for (const result of failed) lines.push(`- ${result.source.name}：${result.error}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatSelectedEntry(entry) {
  const item = entry.item ?? {};
  const title = entry.title || item.title || item.id || item.full_name || item.name || '(untitled)';
  const url = entry.url || item.url || item.html_url || '';
  const bits = [];
  bits.push(`分数：${entry.score}`);
  bits.push(`来源：${entry.sourceName}`);
  if (item.keyword) bits.push(`关键词：${item.keyword}`);
  if (item.author) bits.push(`作者：${item.author}`);
  if (item.likes != null) bits.push(`likes：${item.likes}`);
  if (item.downloads != null) bits.push(`downloads：${item.downloads}`);
  if (item.stars != null) bits.push(`stars：${item.stars}`);
  if (item.published_at) bits.push(`时间：${item.published_at}`);
  if (item.pushed_at) bits.push(`推送：${item.pushed_at}`);
  if (item.updated_at) bits.push(`更新：${item.updated_at}`);
  if (entry.freshness?.rawDate) bits.push(`新鲜度时间：${entry.freshness.rawDate}`);
  const desc = entry.description || item.description || item.summary || item.tags || '';
  const needsConfirmation = item.type === 'homepage-snapshot' || item.type === 'candidate-link';
  return [
    `- 标题：${title}`,
    url ? `  链接：${url}` : undefined,
    needsConfirmation ? '  可信度提示：需进一步确认（网页快照或候选链接，不等同于完整公告正文）' : undefined,
    bits.length ? `  元信息：${bits.join('；')}` : undefined,
    entry.reasons?.length ? `  入选理由：${entry.reasons.join('；')}` : undefined,
    entry.penalties?.length ? `  扣分项：${entry.penalties.join('；')}` : undefined,
    desc ? `  摘要：${String(desc).replace(/\s+/g, ' ').slice(0, 500)}` : undefined,
  ].filter(Boolean).join('\n');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function groupBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}

main();
