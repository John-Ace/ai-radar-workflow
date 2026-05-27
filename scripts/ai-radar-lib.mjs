import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { markdownArchivePath, writeMarkdownArchive } from './archive-paths.mjs';

const USER_AGENT = 'OpenCLI-AI-Radar/0.1 (+local automation)';

export function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function createRunDir(outputDir, now = new Date()) {
  const stamp = formatTimestamp(now);
  const runDir = path.resolve(outputDir, stamp);
  fs.mkdirSync(path.join(runDir, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  return runDir;
}

export function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function formatLocalDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function collectSource(source, config) {
  const startedAt = new Date();
  try {
    let items = [];
    if (source.type === 'opencli') items = collectOpenCli(source, config);
    else if (source.type === 'opencli-keyword') items = collectOpenCliKeyword(source, config);
    else if (source.type === 'github-search') items = await collectGitHub(source, config);
    else if (source.type === 'web-page') items = await collectWebPage(source, config);
    else if (source.type === 'rss') items = await collectRss(source, config);
    else throw new Error(`Unsupported source type: ${source.type}`);

    return {
      source: sourceMeta(source),
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      count: items.length,
      items,
    };
  } catch (err) {
    return {
      source: sourceMeta(source),
      ok: false,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      count: 0,
      error: err instanceof Error ? err.message : String(err),
      items: [],
    };
  }
}

function sourceMeta(source) {
  return {
    id: source.id,
    name: source.name,
    group: source.group,
    type: source.type,
    url: source.url,
  };
}

function collectOpenCli(source, config) {
  const command = materializeCommand(source.command, { limit: source.limit ?? config.defaultLimit });
  return runJsonCommand(command).map((item) => normalizeItem(item, source));
}

function collectOpenCliKeyword(source, config) {
  const out = [];
  for (const keyword of source.keywords ?? []) {
    const command = materializeCommand(source.command, {
      keyword,
      limit: source.limit ?? config.defaultLimit,
    });
    const rows = runJsonCommand(command);
    for (const row of rows) out.push(normalizeItem(row, source, keyword));
  }
  return out;
}

function materializeCommand(command, vars) {
  return command.map((part) => String(part).replaceAll('{keyword}', vars.keyword ?? '').replaceAll('{limit}', String(vars.limit)));
}

function runJsonCommand(command) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command.join(' ')} failed: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function collectGitHub(source, config) {
  const out = [];
  const since = freshnessSinceDate(config);
  for (const keyword of source.keywords ?? []) {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', `${keyword} pushed:>=${since}`);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(source.limit ?? config.defaultLimit));
    const data = await fetchJsonWithRetry(url);
    for (const repo of data.items ?? []) {
      out.push({
        title: repo.full_name,
        description: repo.description ?? '',
        url: repo.html_url,
        author: repo.owner?.login ?? '',
        stars: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        updated_at: repo.updated_at,
        keyword,
        source: source.name,
        group: source.group,
      });
    }
  }
  return out;
}

async function collectWebPage(source, config) {
  const html = await fetchTextWithRetry(source.url);
  const title = decodeHtml(extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? source.name);
  const description = decodeHtml(
    extractFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? extractFirst(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? ''
  );
  const imageUrls = extractPageImageUrls(html, source.url);
  const keywords = source.keywords ?? config.officialKeywords ?? [];
  const links = extractLinks(html, source.url)
    .filter((link) => link.text.length >= 4)
    .filter((link) => keywords.length === 0 || keywords.some((keyword) => `${link.text} ${link.href}`.toLowerCase().includes(String(keyword).toLowerCase())))
    .slice(0, source.limit ?? config.defaultLimit);

  return [
    {
      title,
      description,
      url: source.url,
      source: source.name,
      group: source.group,
      type: 'homepage-snapshot',
      imageUrls,
    },
    ...links.map((link) => {
      const detectedDate = extractDateFromText(`${link.text} ${link.context}`);
      return {
        title: link.text,
        url: link.href,
        description: link.context,
        source: source.name,
        group: source.group,
        type: 'candidate-link',
        ...(detectedDate ? { published_at: detectedDate } : {}),
      };
    }),
  ];
}

async function collectRss(source, config) {
  const xml = await fetchTextWithRetry(source.url);
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .slice(0, source.limit ?? config.defaultLimit)
    .map((match) => {
      const block = match[0];
      return {
        title: decodeHtml(stripCdata(extractFirst(block, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? '')),
        description: stripTags(decodeHtml(stripCdata(extractFirst(block, /<description[^>]*>([\s\S]*?)<\/description>/i) ?? ''))).replace(/\s+/g, ' ').trim(),
        url: decodeHtml(stripCdata(extractFirst(block, /<link[^>]*>([\s\S]*?)<\/link>/i) ?? '')),
        published_at: decodeHtml(stripCdata(extractFirst(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ?? '')),
        imageUrls: extractRssImageUrls(block),
        source: source.name,
        group: source.group,
      };
    })
    .filter((item) => item.title || item.url);

  if (items.length > 0) return items;

  const feedTitle = decodeHtml(stripCdata(extractFirst(xml, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? source.name));
  return [{ title: feedTitle, url: source.url, source: source.name, group: source.group, type: 'feed-snapshot' }];
}

async function fetchJsonWithRetry(url) {
  const text = await fetchTextWithRetry(url);
  return JSON.parse(text);
}

async function fetchTextWithRetry(url, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json,*/*' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const rawHref = decodeHtml(match[1]);
    const rawText = stripTags(decodeHtml(match[2])).replace(/\s+/g, ' ').trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;
    try {
      out.push({
        href: new URL(rawHref, baseUrl).toString(),
        text: rawText,
        context: extractLinkContext(html, match.index, re.lastIndex, rawText),
      });
    } catch {}
  }
  return uniqueBy(out, (item) => `${item.href}|${item.text}`).slice(0, 200);
}

function extractLinkContext(html, start, end, linkText) {
  const before = html.slice(Math.max(0, start - 500), start);
  const after = html.slice(end, Math.min(html.length, end + 500));
  const context = stripTags(decodeHtml(`${before} ${linkText} ${after}`))
    .replace(/\s+/g, ' ')
    .trim();
  if (!context || context === linkText) return '';
  return context.slice(0, 500);
}

function extractPageImageUrls(html, baseUrl) {
  const urls = [
    ...extractMetaValues(html, 'property', ['og:image', 'og:image:url', 'twitter:image']),
    ...extractMetaValues(html, 'name', ['twitter:image']),
  ];
  return uniqueBy(
    urls
      .map((url) => resolveUrl(url, baseUrl))
      .filter(Boolean),
    (url) => url
  );
}

function extractMetaValues(html, attrName, attrValues) {
  const out = [];
  const re = /<meta\b[^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[0];
    const attr = readTagAttribute(tag, attrName);
    if (!attrValues.some((value) => value.toLowerCase() === attr.toLowerCase())) continue;
    const content = readTagAttribute(tag, 'content');
    if (content) out.push(content);
  }
  return out;
}

function extractRssImageUrls(block) {
  const urls = [];
  for (const match of block.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi)) {
    const tag = match[0];
    const url = readTagAttribute(tag, 'url');
    const type = readTagAttribute(tag, 'type');
    const medium = readTagAttribute(tag, 'medium');
    if (!url) continue;
    if (type && !type.toLowerCase().startsWith('image/')) continue;
    if (medium && medium.toLowerCase() !== 'image') continue;
    urls.push(url);
  }
  return uniqueBy(urls, (url) => url);
}

function readTagAttribute(tag, name) {
  const re = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i');
  return decodeHtml(re.exec(tag)?.[1] ?? '');
}

function resolveUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return String(value).trim();
  }
}

function normalizeItem(item, source, keyword) {
  return {
    ...item,
    ...(source.assumeCurrentDate && !hasAnyDate(item) ? { date: new Date().toISOString() } : {}),
    keyword,
    source: source.name,
    group: source.group,
  };
}

function hasAnyDate(item) {
  return Boolean(
    item.published_at
    || item.publishedAt
    || item.created_at
    || item.createdAt
    || item.pushed_at
    || item.pushedAt
    || item.updated_at
    || item.updatedAt
    || item.lastModified
    || item.date
  );
}

function freshnessWindowMs(config) {
  const maxAgeHours = Number(config.selection?.freshness?.maxAgeHours ?? 48);
  return Math.max(1, maxAgeHours) * 36e5;
}

function freshnessSinceDate(config) {
  const previousDays = config.selection?.freshness?.maxPreviousCalendarDays;
  if (Number.isFinite(previousDays)) {
    const date = new Date();
    date.setDate(date.getDate() - Math.max(0, Number(previousDays)));
    return formatLocalDate(date);
  }
  return formatLocalDate(new Date(Date.now() - freshnessWindowMs(config)));
}

export function writeRunFiles(runDir, config, results, generatedAt = new Date()) {
  for (const result of results) {
    writeJson(path.join(runDir, 'raw', `${safeFileName(result.source.id)}.json`), result);
  }
  const okCount = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  const totalItems = results.reduce((sum, result) => sum + result.count, 0);
  const status = {
    date: formatLocalDate(generatedAt),
    generatedAt: generatedAt.toISOString(),
    collectionStatus: failed.length === 0 ? 'done' : okCount > 0 ? 'partial' : 'failed',
    analysisStatus: totalItems > 0 ? 'pending' : 'blocked',
    totalSources: results.length,
    okSources: okCount,
    failedSources: failed.length,
    totalItems,
    pendingBriefPath: path.join(runDir, 'ai-brief.md'),
    failures: failed.map((result) => ({ id: result.source.id, name: result.source.name, error: result.error })),
  };
  const archive = config.archive;
  if (archive?.codexBriefDir) {
    status.pendingBriefArchivePath = markdownArchivePath(
      process.cwd(),
      archive.codexBriefDir,
      status.date,
      archive.briefFileSuffix ?? 'AI 日报'
    );
  }
  writeJson(path.join(runDir, 'raw', 'all-results.json'), { config, results });
  const basicReport = buildBasicReport(config, results, status);
  fs.writeFileSync(path.join(runDir, 'basic-report.md'), basicReport, 'utf8');
  if (archive?.opencliDataDir && status.collectionStatus !== 'failed') {
    status.openCliDataArchivePath = writeMarkdownArchive(
      process.cwd(),
      archive.opencliDataDir,
      status.date,
      archive.dataFileSuffix ?? '数据爬取',
      basicReport
    );
  }
  writeJson(path.join(runDir, 'status.json'), status);
  return status;
}

export function buildBasicReport(config, results, status) {
  const lines = [];
  lines.push(`# ${config.name}基础采集报告`);
  lines.push('');
  lines.push(`- 日期：${status.date}`);
  lines.push(`- 采集状态：${status.collectionStatus}`);
  lines.push(`- 成功源：${status.okSources}/${status.totalSources}`);
  lines.push(`- 原始条目：${status.totalItems}`);
  lines.push(`- 分析状态：${status.analysisStatus}`);
  lines.push('');

  const groups = groupBy(results, (result) => result.source.group ?? '未分组');
  for (const [group, groupResults] of Object.entries(groups)) {
    lines.push(`## ${group}`);
    lines.push('');
    for (const result of groupResults) {
      lines.push(`### ${result.source.name}`);
      lines.push('');
      if (!result.ok) {
        lines.push(`- 状态：失败`);
        lines.push(`- 错误：${result.error}`);
        lines.push('');
        continue;
      }
      lines.push(`- 状态：成功`);
      lines.push(`- 条目：${result.count}`);
      lines.push('');
      for (const item of result.items.slice(0, 12)) {
        const title = item.title || item.name || item.id || item.full_name || item.url || '(untitled)';
        const url = item.url || item.html_url;
        const meta = [item.keyword, item.author, item.source && item.source !== result.source.name ? item.source : undefined]
          .filter(Boolean)
          .join(' / ');
        lines.push(`- ${url ? `[${escapeMd(title)}](${url})` : escapeMd(title)}${meta ? ` — ${escapeMd(meta)}` : ''}`);
      }
      lines.push('');
    }
  }

  if (status.failures.length > 0) {
    lines.push('## 失败源');
    lines.push('');
    for (const failure of status.failures) lines.push(`- ${failure.name}：${failure.error}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function safeFileName(value) {
  return String(value).replace(/[\\/:"*?<>|]+/g, '_').slice(0, 100) || 'source';
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

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFirst(text, re) {
  return re.exec(text)?.[1];
}

function stripTags(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
}

function stripCdata(value) {
  return String(value).replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function decodeHtml(value) {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function extractDateFromText(value) {
  const text = cleanDateText(value);
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthNames = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const monthDayYear = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, 'i').exec(text);
  if (monthDayYear) return toIsoDate(Number(monthDayYear[3]), monthNumber(monthDayYear[1]), Number(monthDayYear[2]));

  const yearMonthDay = new RegExp(`\\b(20\\d{2})\\s+(${monthNames})\\s+(\\d{1,2})\\b`, 'i').exec(text);
  if (yearMonthDay) return toIsoDate(Number(yearMonthDay[1]), monthNumber(yearMonthDay[2]), Number(yearMonthDay[3]));

  return '';
}

function cleanDateText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function monthNumber(value) {
  const key = String(value).slice(0, 3).toLowerCase();
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key) + 1;
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString();
}

function escapeMd(value) {
  return String(value).replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}
