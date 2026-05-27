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
    ['claude', 'codex', 'openclaw']
  );
});
