#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function run(label, args) {
  console.log(`[ai-radar-wakeup] ${label}`);
  const result = spawnSync('npm', ['run', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.log(`[ai-radar-wakeup] ${label} exited with status ${result.status}`);
  }
  return result.status ?? 0;
}

run('fetch-if-needed', ['ai:fetch-if-needed']);
run('brief-if-needed', ['ai:brief-if-needed']);
