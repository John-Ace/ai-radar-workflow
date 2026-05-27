#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const runsDir = path.join(root, 'runs', 'ai-radar');

const IMPORTANT_TERMS = [
  'openai', 'anthropic', 'claude', 'chatgpt', 'gpt', 'deepmind', 'gemini',
  'meta ai', 'llama', 'deepseek', 'qwen', 'kimi', 'minimax', 'glm', 'zhipu',
  'agent', 'reasoning', 'multimodal', 'video', 'coding', 'code', 'api',
  'benchmark', 'eval', 'open source', 'opensource', 'model', 'inference',
  'context', 'tool use', 'rag', 'embedding', 'voice', 'robotics',
];

const ACTION_TERMS = [
  'release', 'released', 'launch', 'launched', 'announce', 'announced',
  'introducing', 'new', 'update', 'upgrade', 'open-source', 'open source',
  'paper', 'research', 'api', 'pricing', 'faster', 'cheaper', 'available',
  '发布', '推出', '上线', '更新', '开源', '论文', '模型', '能力', '降价',
];

const LOW_VALUE_PATTERNS = [
  /\bnewsletter\b/i,
  /\bweekly roundup\b/i,
  /\bsubscribe\b/i,
  /\bwebinar\b/i,
  /\bhiring\b/i,
  /\bpodcast\b/i,
  /privacy policy/i,
  /terms of/i,
  /cookie/i,
  /careers/i,
  /\bai-free\b/i,
  /\bnot ai\b/i,
  /tarot/i,
  /psychic/i,
];

const COMMUNITY_SOURCE_IDS = new Set(['twitter', 'reddit', 'hackernews']);

const SOURCE_BASE_SCORE = {
  '海外官方源': 34,
  '国内官方源': 32,
  '论文与研究': 28,
  '高频 AI 资讯源': 26,
  '开源项目趋势': 24,
  '模型与工具': 22,
  '开发者与产品源': 20,
  '海外社区热度': 14,
};

export function findLatestRun() {
  if (!fs.existsSync(runsDir)) return null;
  return fs.readdirSync(runsDir)
    .map((name) => path.join(runsDir, name))
    .filter((dir) => fs.existsSync(path.join(dir, 'raw', 'all-results.json')))
    .sort()
    .reverse()[0] ?? null;
}

export function buildSelection(all, options = {}) {
  const config = all.config ?? {};
  const { referenceTime, ...selectionOptions } = options;
  const referenceDate = normalizeReferenceDate(referenceTime ?? all.generatedAt);
  const selectionConfig = {
    minItems: 20,
    targetItems: 25,
    maxItems: 25,
    maxPerSource: 4,
    maxPerGroup: 6,
    ...(config.selection ?? {}),
    ...selectionOptions,
  };

  const flattened = flattenResults(all.results ?? []);
  const uniqueItems = dedupeItems(flattened);
  const freshnessConfig = normalizeFreshnessConfig(selectionConfig.freshness);
  const freshItems = [];
  const staleItems = [];
  for (const entry of uniqueItems) {
    const freshness = checkFreshness(entry.item, referenceDate, freshnessConfig);
    const enriched = { ...entry, freshness };
    if (freshness.ok) freshItems.push(enriched);
    else staleItems.push(enriched);
  }

  const scoredFresh = freshItems
    .map((entry) => scoreEntry(entry, referenceDate, config.communityTrust ?? {}))
    .filter((entry) => entry.score >= 18)
    .sort(compareEntries);

  const selected = selectWithDiversity(scoredFresh, selectionConfig);
  const selectedKeys = new Set(selected.map((entry) => entry.key));
  const rejected = scoredFresh.filter((entry) => !selectedKeys.has(entry.key));

  return {
    generatedAt: new Date().toISOString(),
    referenceTime: referenceDate.toISOString(),
    config: selectionConfig,
    totalRawItems: flattened.length,
    totalUniqueItems: uniqueItems.length,
    totalFreshItems: freshItems.length,
    totalStaleItems: staleItems.length,
    totalScoredItems: scoredFresh.length,
    selectedItems: selected.length,
    selected,
    rejected: rejected.slice(0, 80),
    stale: staleItems.slice(0, 80).map((entry) => ({
      key: entry.key,
      title: entry.title,
      url: entry.url,
      sourceId: entry.source.id,
      sourceName: entry.sourceName,
      group: entry.group,
      reason: entry.freshness.reason,
      rawDate: entry.freshness.rawDate,
      ageHours: entry.freshness.ageHours,
    })),
  };
}

export function writeSelectionFiles(runDir, selection) {
  const selectedPath = path.join(runDir, 'selected-results.json');
  const reportPath = path.join(runDir, 'selection-report.md');
  fs.writeFileSync(selectedPath, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, buildSelectionReport(selection), 'utf8');

  const statusPath = path.join(runDir, 'status.json');
  if (fs.existsSync(statusPath)) {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    status.selectionStatus = 'done';
    status.selectedItems = selection.selectedItems;
    status.selectionTargetItems = selection.config.targetItems;
    status.selectionReportPath = reportPath;
    fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  }

  return { selectedPath, reportPath };
}

function main() {
  const runDir = process.argv[2] ? path.resolve(process.argv[2]) : findLatestRun();
  if (!runDir) {
    console.log('[ai-filter] no AI radar run found');
    return;
  }
  const allPath = path.join(runDir, 'raw', 'all-results.json');
  const all = JSON.parse(fs.readFileSync(allPath, 'utf8'));
  const currentConfig = readCurrentConfig();
  if (currentConfig) {
    all.config = {
      ...(all.config ?? {}),
      selection: currentConfig.selection ?? all.config?.selection,
      communityTrust: currentConfig.communityTrust ?? all.config?.communityTrust,
    };
  }
  const statusPath = path.join(runDir, 'status.json');
  const status = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {};
  const selection = buildSelection(all, { referenceTime: status.generatedAt });
  const files = writeSelectionFiles(runDir, selection);
  console.log(`[ai-filter] run: ${path.relative(root, runDir)}`);
  console.log(`[ai-filter] raw: ${selection.totalRawItems}`);
  console.log(`[ai-filter] unique: ${selection.totalUniqueItems}`);
  console.log(`[ai-filter] selected: ${selection.selectedItems}/${selection.config.targetItems}`);
  console.log(`[ai-filter] output: ${path.relative(root, files.selectedPath)}`);
  console.log(`[ai-filter] report: ${path.relative(root, files.reportPath)}`);
}

function flattenResults(results) {
  const out = [];
  for (const result of results) {
    if (!result.ok) continue;
    for (const item of result.items ?? []) {
      const title = item.title || item.full_name || item.name || item.text || item.id || item.url || '';
      const url = item.url || item.html_url || '';
      if (!title && !url) continue;
      out.push({
        key: '',
        source: result.source,
        item,
        title: cleanText(title),
        url,
        description: cleanText(item.description || item.summary || item.text || item.body || item.tagline || ''),
        group: result.source.group ?? item.group ?? '未分组',
        sourceName: result.source.name ?? item.source ?? '未知来源',
      });
    }
  }
  return out;
}

function dedupeItems(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = makeDedupeKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...entry, key });
  }
  return out;
}

function scoreEntry(entry, referenceDate, communityTrust) {
  const text = `${entry.title} ${entry.description} ${entry.url} ${entry.item.keyword ?? ''}`;
  const lower = text.toLowerCase();
  const reasons = [];
  const penalties = [];
  let score = SOURCE_BASE_SCORE[entry.group] ?? 18;
  reasons.push(`${entry.group}来源 +${SOURCE_BASE_SCORE[entry.group] ?? 18}`);

  const importantHits = countHits(lower, IMPORTANT_TERMS);
  if (importantHits > 0) {
    const points = Math.min(24, importantHits * 4);
    score += points;
    reasons.push(`关键AI主题命中 ${importantHits} 个 +${points}`);
  }

  const actionHits = countHits(lower, ACTION_TERMS);
  if (actionHits > 0) {
    const points = Math.min(16, actionHits * 3);
    score += points;
    reasons.push(`更新/发布信号 ${actionHits} 个 +${points}`);
  }

  const metricScore = scoreMetrics(entry.item);
  if (metricScore > 0) {
    score += metricScore;
    reasons.push(`热度/项目指标 +${metricScore}`);
  }

  const freshness = scoreFreshness(entry.item, referenceDate);
  if (freshness > 0) {
    score += freshness;
    reasons.push(`近期信息 +${freshness}`);
  }

  const communityScore = scoreCommunityTrust(entry, communityTrust, lower);
  if (communityScore.points > 0) {
    score += communityScore.points;
    reasons.push(...communityScore.reasons);
  }

  if (entry.item.type === 'homepage-snapshot') {
    score -= 10;
    penalties.push('首页快照信息密度较低 -10');
    score -= 14;
    penalties.push('首页快照需进一步确认 -14');
  }
  if (entry.item.type === 'candidate-link') {
    score -= 4;
    penalties.push('网页候选链接待人工判断 -4');
    if (!hasInformationSignal(entry.item, entry.description)) {
      score -= 12;
      penalties.push('网页候选缺少摘要或时间信号 -12');
    }
  }
  if (entry.title.length < 12) {
    score -= 6;
    penalties.push('标题过短 -6');
  }
  if (!entry.url) {
    score -= 5;
    penalties.push('缺少可追溯链接 -5');
  }
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(text))) {
    score -= 16;
    penalties.push('疑似低价值/营销/站务内容 -16');
  }

  const communityPenalty = scoreCommunityPenalty(entry, communityTrust, lower);
  if (communityPenalty.points < 0) {
    score += communityPenalty.points;
    penalties.push(...communityPenalty.penalties);
  }

  const sourcePenalty = scoreSourceSpecificPenalty(entry, referenceDate);
  if (sourcePenalty.points < 0) {
    score += sourcePenalty.points;
    penalties.push(`${sourcePenalty.reason} ${sourcePenalty.points}`);
  }

  return {
    key: entry.key,
    score,
    group: entry.group,
    sourceName: entry.sourceName,
    sourceId: entry.source.id,
    title: entry.title,
    url: entry.url,
    description: entry.description,
    item: entry.item,
    freshness: entry.freshness,
    reasons,
    penalties,
  };
}

function selectWithDiversity(scored, config) {
  const selected = [];
  const sourceCounts = new Map();
  const groupCounts = new Map();

  for (const entry of scored) {
    if (selected.length >= config.maxItems) break;
    const sourceCount = sourceCounts.get(entry.sourceId) ?? 0;
    const groupCount = groupCounts.get(entry.group) ?? 0;
    if (sourceCount >= config.maxPerSource) continue;
    if (groupCount >= config.maxPerGroup) continue;
    selected.push(entry);
    sourceCounts.set(entry.sourceId, sourceCount + 1);
    groupCounts.set(entry.group, groupCount + 1);
  }

  if (selected.length < config.minItems) {
    const selectedKeys = new Set(selected.map((entry) => entry.key));
    for (const entry of scored) {
      if (selected.length >= config.minItems) break;
      if (selectedKeys.has(entry.key)) continue;
      selected.push(entry);
      selectedKeys.add(entry.key);
    }
  }

  return selected.slice(0, config.targetItems);
}

function buildSelectionReport(selection) {
  const lines = [];
  lines.push('# AI 信息筛选报告');
  lines.push('');
  lines.push(`- 原始条目：${selection.totalRawItems}`);
  lines.push(`- 去重后：${selection.totalUniqueItems}`);
  lines.push(`- 新鲜度合格：${selection.totalFreshItems}`);
  lines.push(`- 新鲜度剔除：${selection.totalStaleItems}`);
  lines.push(`- 达到最低分：${selection.totalScoredItems}`);
  lines.push(`- 入选日报候选：${selection.selectedItems}`);
  lines.push(`- 目标数量：${selection.config.minItems}-${selection.config.maxItems} 条，当前目标 ${selection.config.targetItems} 条`);
  lines.push('');
  lines.push('## 入选内容');
  lines.push('');
  selection.selected.forEach((entry, index) => {
    lines.push(`### ${index + 1}. ${entry.title}`);
    lines.push('');
    lines.push(`- 分数：${entry.score}`);
    lines.push(`- 来源：${entry.group} / ${entry.sourceName}`);
    if (entry.url) lines.push(`- 链接：${entry.url}`);
    if (entry.freshness?.rawDate) lines.push(`- 时间：${entry.freshness.rawDate}`);
    lines.push(`- 入选理由：${entry.reasons.join('；')}`);
    if (entry.penalties.length) lines.push(`- 扣分项：${entry.penalties.join('；')}`);
    if (entry.description) lines.push(`- 摘要：${entry.description.slice(0, 300)}`);
    lines.push('');
  });
  if (selection.stale?.length) {
    lines.push('## 新鲜度剔除样例');
    lines.push('');
    for (const entry of selection.stale.slice(0, 30)) {
      lines.push(`- ${entry.title}（${entry.sourceName}）：${entry.reason}${entry.rawDate ? `，时间 ${entry.rawDate}` : ''}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function compareEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return a.title.localeCompare(b.title);
}

function scoreMetrics(item) {
  let score = 0;
  if (Number.isFinite(item.stars)) score += Math.min(16, Math.floor(Math.log10(item.stars + 1) * 5));
  if (Number.isFinite(item.likes)) score += Math.min(10, Math.floor(Math.log10(item.likes + 1) * 4));
  if (Number.isFinite(item.points)) score += Math.min(10, Math.floor(Math.log10(item.points + 1) * 4));
  if (Number.isFinite(item.comments)) score += Math.min(8, Math.floor(Math.log10(item.comments + 1) * 3));
  if (Number.isFinite(item.downloads)) score += Math.min(14, Math.floor(Math.log10(item.downloads + 1) * 4));
  return score;
}

function scoreFreshness(item, referenceDate) {
  const rawDate = getItemDate(item);
  if (!rawDate) return 0;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return 0;
  const ageHours = (referenceDate.getTime() - date.getTime()) / 36e5;
  if (ageHours <= 24) return 12;
  if (ageHours <= 72) return 8;
  if (ageHours <= 168) return 4;
  return 0;
}

function scoreSourceSpecificPenalty(entry, referenceDate) {
  const item = entry.item;
  const sourceId = entry.source.id;
  if (sourceId === 'github') {
    const stars = Number(item.stars ?? 0);
    if (stars === 0) return { points: -28, reason: 'GitHub 零 star，暂缺项目质量信号' };
    if (stars < 10) return { points: -18, reason: 'GitHub star 较少，成熟度信号偏弱' };
  }

  if (sourceId === 'huggingface-models') {
    const ageDays = ageInDays(getItemDate(item), referenceDate);
    if (ageDays > 180) return { points: -14, reason: 'Hugging Face 模型更新时间较旧' };
    if (ageDays > 60) return { points: -8, reason: 'Hugging Face 模型不是近期更新' };
  }

  if (sourceId === 'twitter' || sourceId === 'reddit' || sourceId === 'hackernews') {
    const ageDays = ageInDays(getItemDate(item), referenceDate);
    if (ageDays > 30) return { points: -18, reason: '社区内容发布时间较旧' };
    if (ageDays > 7) return { points: -10, reason: '社区内容不是本周信号' };
  }

  return { points: 0, reason: '' };
}

function normalizeFreshnessConfig(config = {}) {
  return {
    maxAgeHours: Number(config.maxAgeHours ?? 48),
    maxPreviousCalendarDays: Number.isFinite(config.maxPreviousCalendarDays) ? Number(config.maxPreviousCalendarDays) : null,
    requireDate: config.requireDate !== false,
    allowFutureHours: Number(config.allowFutureHours ?? 6),
  };
}

function checkFreshness(item, referenceDate, config) {
  const rawDate = getItemDate(item);
  if (!rawDate) {
    return {
      ok: !config.requireDate,
      reason: config.requireDate ? '缺少可靠发布时间或更新时间' : '缺少时间但配置允许',
      rawDate: '',
      ageHours: null,
    };
  }

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      reason: '时间字段无法解析',
      rawDate,
      ageHours: null,
    };
  }

  const ageHours = (referenceDate.getTime() - date.getTime()) / 36e5;
  if (ageHours < -config.allowFutureHours) {
    return {
      ok: false,
      reason: `时间晚于采集时间超过 ${config.allowFutureHours} 小时`,
      rawDate,
      ageHours,
    };
  }
  if (config.maxPreviousCalendarDays != null) {
    const itemLocalDate = formatLocalDate(date);
    const cutoffLocalDate = formatLocalDate(addLocalDays(referenceDate, -config.maxPreviousCalendarDays));
    const referenceLocalDate = formatLocalDate(referenceDate);
    if (itemLocalDate < cutoffLocalDate || itemLocalDate > referenceLocalDate) {
      return {
        ok: false,
        reason: `不属于今天或前 ${config.maxPreviousCalendarDays} 个本地日历日`,
        rawDate,
        ageHours,
      };
    }
    return {
      ok: true,
      reason: `属于今天或前 ${config.maxPreviousCalendarDays} 个本地日历日`,
      rawDate,
      ageHours,
    };
  }
  if (ageHours > config.maxAgeHours) {
    return {
      ok: false,
      reason: `超过 ${config.maxAgeHours} 小时新鲜度窗口`,
      rawDate,
      ageHours,
    };
  }
  return {
    ok: true,
    reason: `处于 ${config.maxAgeHours} 小时新鲜度窗口内`,
    rawDate,
    ageHours,
  };
}

function scoreCommunityTrust(entry, communityTrust, lowerText) {
  if (!isCommunitySource(entry)) return { points: 0, reasons: [] };

  let points = 0;
  const reasons = [];
  const author = String(entry.item.author ?? '').trim();
  const trustedAuthors = normalizedTrustedAuthors(communityTrust.trustedAuthors?.[entry.source.id] ?? []);
  if (author && trustedAuthors.has(normalizeHandle(author))) {
    points += 18;
    reasons.push(`一手社区信号：可信作者 ${author} +18`);
  }

  const trustedDomain = findTrustedDomain(entry.url, communityTrust.trustedDomains ?? []);
  if (trustedDomain) {
    points += 8;
    reasons.push(`社区内容指向可信来源 ${trustedDomain} +8`);
  }

  if (/\b(launch|launched|release|released|available|introducing|announcing|pricing|benchmark|paper)\b/i.test(lowerText)) {
    points += 4;
    reasons.push('社区内容包含明确发布/研究信号 +4');
  }

  return { points: Math.min(points, 24), reasons };
}

function scoreCommunityPenalty(entry, communityTrust, lowerText) {
  if (!isCommunitySource(entry)) return { points: 0, penalties: [] };
  const patterns = [
    ...(communityTrust.lowValuePatterns ?? []),
    'bookmark',
    'save this',
    'worth than $500',
    'worth $500',
    '10 tools',
    'make money',
    'course',
    'replace one movie',
    'monetize',
  ];
  if (patterns.some((pattern) => lowerText.includes(String(pattern).toLowerCase()))) {
    return { points: -18, penalties: ['社区低价值或营销诱导内容 -18'] };
  }
  return { points: 0, penalties: [] };
}

function isCommunitySource(entry) {
  return COMMUNITY_SOURCE_IDS.has(entry.source.id);
}

function normalizedTrustedAuthors(authors) {
  return new Set(authors.map((author) => normalizeHandle(author)));
}

function normalizeHandle(value) {
  return String(value).replace(/^@/, '').toLowerCase();
}

function findTrustedDomain(url, domains) {
  if (!url) return '';
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
  return domains.find((domain) => {
    const normalized = String(domain).toLowerCase().replace(/^www\./, '');
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  }) ?? '';
}

function countHits(text, terms) {
  let hits = 0;
  for (const term of terms) {
    if (text.includes(term.toLowerCase())) hits += 1;
  }
  return hits;
}

function makeDedupeKey(entry) {
  if (entry.url) return `url:${normalizeUrl(entry.url)}`;
  return `title:${entry.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const param of [...url.searchParams.keys()]) {
      if (/^(utm_|ref|source$|fbclid$|gclid$)/i.test(param)) url.searchParams.delete(param);
    }
    return url.toString();
  } catch {
    return String(value).trim();
  }
}

function ageInDays(rawDate, referenceDate) {
  if (!rawDate) return 0;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return 0;
  return (referenceDate.getTime() - date.getTime()) / 864e5;
}

function getItemDate(item) {
  return item.published_at
    || item.publishedAt
    || item.created_at
    || item.createdAt
    || item.pushed_at
    || item.pushedAt
    || item.updated_at
    || item.updatedAt
    || item.lastModified
    || item.date
    || '';
}

function cleanText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeReferenceDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatLocalDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addLocalDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function hasInformationSignal(item, description) {
  return Boolean(
    cleanText(description).length >= 40
    || getItemDate(item)
  );
}

function readCurrentConfig() {
  const configPath = path.join(root, 'configs', 'ai-radar.json');
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
