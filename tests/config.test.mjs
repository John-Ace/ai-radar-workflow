import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync('configs/ai-radar.json', 'utf8'));

test('AI radar config includes agent skill and MCP keywords for community and open-source sources', () => {
  assertIncludes(config.officialKeywords, ['MCP', 'workflow', 'skills']);
  assertIncludes(source('twitter').keywords, ['Claude Code skills', 'MCP agent', 'agent workflow']);
  assertIncludes(source('hackernews').keywords, ['MCP agent', 'agent workflow']);
  assertIncludes(source('reddit').keywords, ['Claude Code skills', 'AI agent skill']);
  assertIncludes(source('github').keywords, ['agent skill', 'mcp agent', 'agent workflow']);
});

test('AI radar config keeps archive directories for separated crawl and brief libraries', () => {
  assert.equal(config.archive.opencliDataDir, 'opencli 数据爬取库');
  assert.equal(config.archive.codexBriefDir, 'Codex AI日报库');
  assert.equal(config.archive.dataFileSuffix, '数据爬取');
  assert.equal(config.archive.briefFileSuffix, 'AI 日报');
});

test('AI radar config uses portable relative automation log paths', () => {
  assert.equal(config.automation.logPath, 'logs/ai-radar-fetch.log');
  assert.equal(config.automation.errLogPath, 'logs/ai-radar-fetch.err.log');
});

test('AI radar selection requires recent dated items for daily freshness', () => {
  assert.equal(config.selection.minItems, 25);
  assert.equal(config.selection.targetItems, 25);
  assert.equal(config.selection.maxItems, 25);
  assert.equal(config.selection.freshness.maxPreviousCalendarDays, 1);
  assert.equal(config.selection.freshness.requireDate, true);
  assert.equal(config.selection.freshness.fillOlderWhenInsufficient, undefined);
});

test('AI radar config includes high-frequency sources to keep 25 daily items fresh', () => {
  for (const id of [
    'google-ai-blog',
    'microsoft-ai-blog',
    'huggingface-blog',
    'techcrunch-ai',
    'venturebeat-ai',
    'mit-tech-review',
    'marktechpost-ai',
    'ai-news',
    'devto-ai',
    'producthunt-today',
  ]) {
    assert.ok(source(id), `missing high-frequency source: ${id}`);
  }
});

test('AI radar disables unstable rate-limited sources when high-frequency sources cover the daily target', () => {
  assert.equal(source('arxiv-llm').enabled, false);
  assert.equal(source('reddit').enabled, false);
});

function source(id) {
  return config.sources.find((entry) => entry.id === id);
}

function assertIncludes(actual, expected) {
  for (const item of expected) assert.ok(actual.includes(item), `missing keyword: ${item}`);
}
