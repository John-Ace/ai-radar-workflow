import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { collectSource, writeRunFiles } from '../scripts/ai-radar-lib.mjs';

test('writeRunFiles stores the local calendar date instead of the UTC date', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-radar-date-'));
  const runDir = path.join(tempDir, 'run');
  fs.mkdirSync(path.join(runDir, 'raw'), { recursive: true });

  const status = writeRunFiles(
    runDir,
    { name: 'AI 信息雷达' },
    [],
    new Date('2026-05-17T16:02:45.462Z')
  );

  assert.equal(status.date, '2026-05-18');
});

test('writeRunFiles exports archive markdown paths when configured', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-radar-archive-'));
  const runDir = path.join(tempDir, 'run');
  const opencliArchiveDir = path.join(tempDir, 'opencli-data');
  const briefArchiveDir = path.join(tempDir, 'agent-briefs');
  fs.mkdirSync(path.join(runDir, 'raw'), { recursive: true });

  const status = writeRunFiles(
    runDir,
    {
      name: 'AI 信息雷达',
      archive: {
        opencliDataDir: opencliArchiveDir,
        briefDir: briefArchiveDir,
        dataFileSuffix: '数据爬取',
        briefFileSuffix: 'AI 日报',
      },
    },
    [],
    new Date('2026-05-18T08:19:25.499Z')
  );

  assert.equal(status.openCliDataArchivePath, path.join(opencliArchiveDir, '2026-05-18-数据爬取.md'));
  assert.equal(status.pendingBriefArchivePath, path.join(briefArchiveDir, '2026-05-18-AI 日报.md'));
  assert.equal(fs.existsSync(status.openCliDataArchivePath), true);
});

test('collectSource includes nearby page text for web candidate links', async () => {
  const html = `
    <html>
      <head><title>Example AI Blog</title></head>
      <body>
        <article>
          <time>2026-05-18</time>
          <p>New agent memory update helps coding assistants keep project context.</p>
          <a href="https://example.com/agent-memory-update">Agent memory update</a>
          <p>Available today for developers.</p>
        </article>
      </body>
    </html>
  `;

  const result = await collectSource(
    {
      id: 'example',
      name: 'Example',
      group: '海外官方源',
      type: 'web-page',
      url: `data:text/html,${encodeURIComponent(html)}`,
      limit: 1,
    },
    { officialKeywords: ['agent'] }
  );

  assert.equal(result.ok, true);
  assert.equal(result.items[1].type, 'candidate-link');
  assert.match(result.items[1].description, /project context/);
  assert.match(result.items[1].description, /Available today/);
  assert.equal(result.items[1].published_at, '2026-05-18T00:00:00.000Z');
});

test('collectSource records web page og:image without extra image requests', async () => {
  const html = `
    <html>
      <head>
        <title>Example AI Blog</title>
        <meta property="og:image" content="https://example.com/images/product.png">
      </head>
      <body>AI model update</body>
    </html>
  `;

  const result = await collectSource(
    {
      id: 'example',
      name: 'Example',
      group: '海外官方源',
      type: 'web-page',
      url: `data:text/html,${encodeURIComponent(html)}`,
      limit: 1,
    },
    { officialKeywords: ['AI'] }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.items[0].imageUrls, ['https://example.com/images/product.png']);
});

test('collectSource records RSS media URLs when present', async () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title>OpenAI model update</title>
          <link>https://example.com/update</link>
          <pubDate>Mon, 18 May 2026 00:00:00 GMT</pubDate>
          <media:content url="https://example.com/chart.png" medium="image" />
          <enclosure url="https://example.com/demo.jpg" type="image/jpeg" />
        </item>
      </channel>
    </rss>
  `;

  const result = await collectSource(
    {
      id: 'rss',
      name: 'RSS',
      group: '海外官方源',
      type: 'rss',
      url: `data:text/xml,${encodeURIComponent(xml)}`,
      limit: 1,
    },
    {}
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.items[0].imageUrls, ['https://example.com/chart.png', 'https://example.com/demo.jpg']);
});
