import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = process.cwd();

test('public package does not include private runtime directories', () => {
  for (const dir of ['runs/ai-radar', 'logs', 'opencli 数据爬取库', 'AI 日报库']) {
    assert.equal(fs.existsSync(path.join(root, dir)), false, `runtime directory should not be committed: ${dir}`);
  }
});

test('public package does not contain local user paths in committed text files', () => {
  const offenders = [];
  const forbiddenPath = ['/', 'Users', 'john', ''].join('/');
  for (const file of listTextFiles(root)) {
    const rel = path.relative(root, file);
    if (rel.startsWith('node_modules/')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(forbiddenPath)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test('package scripts expose setup and cross-platform automation entrypoints', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.setup, 'node scripts/setup.mjs');
  assert.equal(pkg.scripts['install:automation'], 'node installers/install-automation.mjs');
  assert.equal(pkg.scripts['ai:wakeup'], 'node scripts/run-ai-radar-wakeup.mjs');
  assert.equal(pkg.scripts['ai:brief-if-needed'], 'node scripts/run-agent-brief-if-needed.mjs');
});

test('public workflow uses a generic agent brief directory by default', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'configs', 'ai-radar.json'), 'utf8'));
  assert.equal(config.archive.briefDir, 'AI 日报库');
  assert.equal(config.archive.codexBriefDir, undefined);
});

test('public package uses a generic agent guide instead of a bundled agent extension', () => {
  assert.equal(fs.existsSync(path.join(root, 'skills')), false);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'agent-guide.md')), true);
});

test('daily brief instructions require Chinese summary headlines', () => {
  const template = fs.readFileSync(path.join(root, 'templates', 'ai-radar-daily.md'), 'utf8');
  const prepare = fs.readFileSync(path.join(root, 'scripts', 'prepare-ai-brief.mjs'), 'utf8');
  const runner = fs.readFileSync(path.join(root, 'scripts', 'run-agent-brief-if-needed.mjs'), 'utf8');

  assert.match(template, /中文标题/);
  assert.match(template, /不能直接复制英文原始标题/);
  assert.match(prepare, /每条日报的大标题必须用中文重新概括/);
  assert.match(prepare, /原始标题/);
  assert.match(runner, /Chinese summary headline/);
});

function listTextFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTextFiles(file));
    else if (/\.(md|mjs|json|yaml|yml|example|gitignore)$/i.test(entry.name)) out.push(file);
  }
  return out;
}
