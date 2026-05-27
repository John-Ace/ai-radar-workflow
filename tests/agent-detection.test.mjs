import test from 'node:test';
import assert from 'node:assert/strict';

import { detectAgentCommand, listAgentPresets } from '../scripts/agent-detection.mjs';

test('detectAgentCommand prefers the current agent environment when available', () => {
  const detected = detectAgentCommand({
    env: { CODEX_SHELL: '1' },
    commandExists: (bin) => ['claude', 'codex'].includes(bin),
  });

  assert.equal(detected.id, 'codex');
  assert.equal(detected.source, 'current environment');
});

test('detectAgentCommand lets AI_RADAR_AGENT override automatic priority', () => {
  const detected = detectAgentCommand({
    env: { CODEX_SHELL: '1', AI_RADAR_AGENT: 'claude' },
    commandExists: (bin) => ['claude', 'codex'].includes(bin),
  });

  assert.equal(detected.id, 'claude');
  assert.equal(detected.source, 'AI_RADAR_AGENT');
});

test('detectAgentCommand does not fall back to Claude when running inside WorkBuddy', () => {
  const detected = detectAgentCommand({
    env: { CLAUDE_CODE_ENTRYPOINT: '1' },
    cwd: '/Users/john/WorkBuddy/2026-05-27-21-22-37/ai-radar-workflow',
    commandExists: (bin) => bin === 'claude',
  });

  assert.equal(detected.id, 'workbuddy');
  assert.equal(detected.label, 'WorkBuddy');
  assert.equal(detected.source, 'current environment');
  assert.equal(detected.runnable, false);
});

test('detectAgentCommand uses WorkBuddy automatically when its CLI exists', () => {
  const detected = detectAgentCommand({
    env: {},
    cwd: '/Users/john/WorkBuddy/2026-05-27-21-22-37/ai-radar-workflow',
    commandExists: (bin) => ['workbuddy', 'claude'].includes(bin),
  });

  assert.equal(detected.id, 'workbuddy');
  assert.equal(detected.runnable, true);
});

test('detectAgentCommand treats AI_RADAR_AGENT=auto as automatic detection', () => {
  const detected = detectAgentCommand({
    env: { CODEX_SHELL: '1', AI_RADAR_AGENT: 'auto' },
    commandExists: (bin) => ['claude', 'codex'].includes(bin),
  });

  assert.equal(detected.id, 'codex');
  assert.equal(detected.source, 'current environment');
});

test('detectAgentCommand falls back to an installed supported CLI', () => {
  const detected = detectAgentCommand({
    env: {},
    commandExists: (bin) => bin === 'openclaw',
  });

  assert.equal(detected.id, 'openclaw');
  assert.equal(detected.source, 'installed CLI');
});

test('listAgentPresets documents supported automatic agents', () => {
  assert.deepEqual(
    listAgentPresets().map((preset) => preset.id),
    ['workbuddy', 'claude', 'codex', 'openclaw']
  );
});
