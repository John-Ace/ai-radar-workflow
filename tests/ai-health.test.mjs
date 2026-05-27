import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHealthReport } from '../scripts/ai-health.mjs';

test('buildHealthReport warns when latest run and automation log disagree', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-health-'));
  const runsDir = path.join(tempDir, 'runs', 'ai-radar');
  const latestRun = path.join(runsDir, '20260518-161925');
  fs.mkdirSync(latestRun, { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(latestRun, 'selected-results.json'), '{}\n');
  fs.writeFileSync(path.join(latestRun, 'analysis-input.md'), '# input\n');
  fs.writeFileSync(path.join(latestRun, 'status.json'), `${JSON.stringify({
    generatedAt: '2026-05-18T08:19:25.499Z',
    collectionStatus: 'done',
    analysisStatus: 'pending',
    totalSources: 17,
    okSources: 17,
    failedSources: 0,
    totalItems: 291,
    selectedItems: 25,
    selectionTargetItems: 25,
  })}\n`);
  const logPath = path.join(tempDir, 'logs', 'ai-radar-fetch.log');
  const errLogPath = path.join(tempDir, 'logs', 'ai-radar-fetch.err.log');
  fs.writeFileSync(logPath, '[ai-radar] run: runs/ai-radar/20260518-160956\n');
  fs.writeFileSync(errLogPath, '');

  const health = buildHealthReport({
    runsDir,
    logPath,
    errLogPath,
    now: new Date('2026-05-18T09:00:00.000Z'),
  });

  assert.equal(health.status, 'warn');
  assert.match(health.warnings.join('\n'), /日志最后记录 run=20260518-160956/);
});

test('buildHealthReport fails when collection is partial', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-health-partial-'));
  const runsDir = path.join(tempDir, 'runs', 'ai-radar');
  const latestRun = path.join(runsDir, '20260518-073000');
  fs.mkdirSync(latestRun, { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(latestRun, 'selected-results.json'), '{}\n');
  fs.writeFileSync(path.join(latestRun, 'analysis-input.md'), '# input\n');
  fs.writeFileSync(path.join(latestRun, 'status.json'), `${JSON.stringify({
    generatedAt: '2026-05-18T23:30:00.000Z',
    collectionStatus: 'partial',
    analysisStatus: 'pending',
    totalSources: 17,
    okSources: 16,
    failedSources: 1,
    totalItems: 250,
    selectedItems: 25,
    selectionTargetItems: 25,
  })}\n`);
  const logPath = path.join(tempDir, 'logs', 'ai-radar-fetch.log');
  const errLogPath = path.join(tempDir, 'logs', 'ai-radar-fetch.err.log');
  fs.writeFileSync(logPath, '[ai-radar] run: runs/ai-radar/20260518-073000\n');
  fs.writeFileSync(errLogPath, '');

  const health = buildHealthReport({
    runsDir,
    logPath,
    errLogPath,
    now: new Date('2026-05-19T00:00:00.000Z'),
  });

  assert.equal(health.status, 'bad');
  assert.match(health.problems.join('\n'), /采集未完全成功：partial/);
  assert.match(health.problems.join('\n'), /失败源：1/);
});
