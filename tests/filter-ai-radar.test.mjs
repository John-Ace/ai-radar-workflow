import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSelection } from '../scripts/filter-ai-radar.mjs';

test('buildSelection scores freshness relative to the run reference time', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
          freshness: {
            requireDate: false,
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'openai',
            name: 'OpenAI',
            group: '海外官方源',
          },
          items: [
            {
              title: 'OpenAI agent model update',
              url: 'https://example.com/openai-agent-model-update',
              published_at: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    },
    { referenceTime: '2020-01-01T12:00:00.000Z' }
  );

  assert.equal(selection.selected[0].score, 61);
  assert.match(selection.selected[0].reasons.join(';'), /近期信息 \+12/);
});

test('buildSelection penalizes low-information web candidate links', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
          freshness: {
            requireDate: false,
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'deepseek',
            name: 'DeepSeek',
            group: '国内官方源',
          },
          items: [
            {
              type: 'candidate-link',
              title: 'Agent Integrations',
              url: 'https://example.com/agent_integrations',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.equal(selection.selected[0].score, 20);
  assert.match(selection.selected[0].penalties.join(';'), /网页候选缺少摘要或时间信号 -12/);
});

test('buildSelection strongly penalizes low-information homepage snapshots', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'kimi',
            name: 'Kimi / 月之暗面',
            group: '国内官方源',
          },
          items: [
            {
              type: 'homepage-snapshot',
              title: 'Kimi AI 官网 - K2.6 上线',
              url: 'https://kimi.moonshot.cn/',
              description: 'Kimi K2.6 模型发布！全新建站功能可生成极具设计感的网站。',
              published_at: '2026-05-18T00:00:00.000Z',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.equal(selection.selected[0].score, 33);
  assert.match(selection.selected[0].penalties.join(';'), /首页快照需进一步确认 -14/);
});

test('buildSelection excludes items older than the freshness window', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
          freshness: {
            maxAgeHours: 48,
            requireDate: true,
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'openai',
            name: 'OpenAI',
            group: '海外官方源',
          },
          items: [
            {
              title: 'OpenAI agent model update',
              url: 'https://example.com/old-openai-agent-model-update',
              published_at: '2026-05-15T00:00:00.000Z',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.equal(selection.selectedItems, 0);
  assert.equal(selection.totalFreshItems, 0);
  assert.equal(selection.totalStaleItems, 1);
  assert.match(selection.stale[0].reason, /超过 48 小时新鲜度窗口/);
});

test('buildSelection excludes undated items when reliable dates are required', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
          freshness: {
            maxAgeHours: 48,
            requireDate: true,
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'anthropic-news',
            name: 'Anthropic News',
            group: '海外官方源',
          },
          items: [
            {
              type: 'candidate-link',
              title: 'Introducing Claude agent tools',
              url: 'https://example.com/claude-agent-tools',
              description: 'A candidate link without a parseable date should not enter the daily brief.',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.equal(selection.selectedItems, 0);
  assert.equal(selection.totalFreshItems, 0);
  assert.equal(selection.totalStaleItems, 1);
  assert.match(selection.stale[0].reason, /缺少可靠发布时间或更新时间/);
});

test('buildSelection respects local today-and-yesterday calendar freshness', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 2,
          maxItems: 2,
          maxPerSource: 2,
          maxPerGroup: 2,
          freshness: {
            maxPreviousCalendarDays: 1,
            requireDate: true,
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'openai',
            name: 'OpenAI',
            group: '海外官方源',
          },
          items: [
            {
              title: 'OpenAI agent update from yesterday',
              url: 'https://example.com/yesterday',
              published_at: '2026-05-25T00:00:00+08:00',
            },
            {
              title: 'OpenAI agent update from the day before yesterday',
              url: 'https://example.com/day-before-yesterday',
              published_at: '2026-05-24T23:00:00+08:00',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-26T12:00:00+08:00' }
  );

  assert.equal(selection.selectedItems, 1);
  assert.equal(selection.selected[0].url, 'https://example.com/yesterday');
  assert.equal(selection.totalStaleItems, 1);
  assert.match(selection.stale[0].reason, /不属于今天或前 1 个本地日历日/);
});

test('buildSelection does not fill to the target with older items', () => {
  const items = [
    {
      title: 'OpenAI agent update from yesterday',
      url: 'https://example.com/yesterday',
      published_at: '2026-05-25T00:00:00+08:00',
    },
    {
      title: 'OpenAI agent update from last week',
      url: 'https://example.com/last-week',
      published_at: '2026-05-20T00:00:00+08:00',
    },
  ];
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 2,
          targetItems: 2,
          maxItems: 2,
          maxPerSource: 2,
          maxPerGroup: 2,
          freshness: {
            maxPreviousCalendarDays: 1,
            requireDate: true,
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'openai',
            name: 'OpenAI',
            group: '海外官方源',
          },
          items,
        },
      ],
    },
    { referenceTime: '2026-05-26T12:00:00+08:00' }
  );

  assert.equal(selection.selectedItems, 1);
  assert.equal(selection.selected[0].url, 'https://example.com/yesterday');
  assert.equal(selection.totalStaleItems, 1);
  assert.equal(selection.stale[0].url, 'https://example.com/last-week');
});

test('buildSelection deduplicates items by normalized URL', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 3,
          maxItems: 3,
          maxPerSource: 3,
          maxPerGroup: 3,
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'openai',
            name: 'OpenAI',
            group: '海外官方源',
          },
          items: [
            {
              title: 'OpenAI agent model update',
              url: 'https://example.com/update?utm_source=newsletter#section',
              published_at: '2026-05-18T00:00:00.000Z',
            },
            {
              title: 'OpenAI agent model update duplicate',
              url: 'https://example.com/update',
              published_at: '2026-05-18T00:00:00.000Z',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.equal(selection.totalRawItems, 2);
  assert.equal(selection.totalUniqueItems, 1);
  assert.equal(selection.selectedItems, 1);
});

test('buildSelection respects maxPerSource when enough alternatives exist', () => {
  const openaiItems = Array.from({ length: 3 }, (_, index) => ({
    title: `OpenAI agent model release ${index}`,
    url: `https://example.com/openai-${index}`,
    published_at: '2026-05-18T00:00:00.000Z',
  }));

  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 3,
          targetItems: 3,
          maxItems: 3,
          maxPerSource: 1,
          maxPerGroup: 3,
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'openai',
            name: 'OpenAI',
            group: '海外官方源',
          },
          items: openaiItems,
        },
        {
          ok: true,
          source: {
            id: 'github',
            name: 'GitHub',
            group: '开源项目趋势',
          },
          items: [
            {
              title: 'agent framework model tools',
              url: 'https://github.com/example/agent-framework',
              stars: 1000,
              updated_at: '2026-05-18T00:00:00.000Z',
            },
          ],
        },
        {
          ok: true,
          source: {
            id: 'arxiv-llm',
            name: 'arXiv LLM / Agent',
            group: '论文与研究',
          },
          items: [
            {
              title: 'Agent model reasoning benchmark',
              url: 'https://arxiv.org/abs/2605.00001',
              published_at: '2026-05-18T00:00:00.000Z',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  const sourceCounts = selection.selected.reduce((counts, entry) => {
    counts[entry.sourceId] = (counts[entry.sourceId] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(selection.selectedItems, 3);
  assert.equal(sourceCounts.openai, 1);
  assert.equal(sourceCounts.github, 1);
  assert.equal(sourceCounts['arxiv-llm'], 1);
});

test('buildSelection boosts trusted community authors as first-party signals', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
        },
        communityTrust: {
          trustedAuthors: {
            twitter: ['OpenAI'],
          },
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'twitter',
            name: 'Twitter/X',
            group: '海外社区热度',
          },
          items: [
            {
              author: 'OpenAI',
              title: 'ChatGPT agent launches new model tools',
              text: 'ChatGPT agent launches new model tools for developers.',
              url: 'https://x.com/i/status/1',
              likes: 500,
              created_at: 'Mon May 18 00:00:00 +0000 2026',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.match(selection.selected[0].reasons.join(';'), /一手社区信号：可信作者 OpenAI \+18/);
});

test('buildSelection penalizes low-value community marketing posts', () => {
  const selection = buildSelection(
    {
      config: {
        selection: {
          minItems: 1,
          targetItems: 1,
          maxItems: 1,
          maxPerSource: 1,
          maxPerGroup: 1,
        },
        communityTrust: {
          lowValuePatterns: ['bookmark', 'worth than $500', 'course'],
        },
      },
      results: [
        {
          ok: true,
          source: {
            id: 'twitter',
            name: 'Twitter/X',
            group: '海外社区热度',
          },
          items: [
            {
              author: 'growth_hacker',
              title: 'Anthropic Claude agent course worth than $500',
              text: 'Bookmark this free course. It is worth than $500.',
              url: 'https://x.com/i/status/2',
              likes: 9000,
              created_at: 'Mon May 18 00:00:00 +0000 2026',
            },
          ],
        },
      ],
    },
    { referenceTime: '2026-05-18T08:00:00.000Z' }
  );

  assert.match(selection.selected[0].penalties.join(';'), /社区低价值或营销诱导内容 -18/);
});
