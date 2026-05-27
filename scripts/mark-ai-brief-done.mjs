#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { writeMarkdownArchive } from './archive-paths.mjs';

const runDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!runDir) {
  console.error('Usage: npm run ai:mark-brief-done -- runs/ai-radar/<run-id>');
  process.exit(1);
}

const statusPath = path.join(runDir, 'status.json');
const briefPath = path.join(runDir, 'ai-brief.md');
if (!fs.existsSync(statusPath)) throw new Error(`Missing status.json: ${statusPath}`);
if (!fs.existsSync(briefPath)) throw new Error(`Missing ai-brief.md: ${briefPath}`);

const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const briefMarkdown = fs.readFileSync(briefPath, 'utf8');
const config = readConfig();
status.analysisStatus = 'done';
status.analysisCompletedAt = new Date().toISOString();
status.briefPath = briefPath;
const briefDir = config.archive?.briefDir ?? config.archive?.codexBriefDir;
if (briefDir) {
  status.briefArchivePath = writeMarkdownArchive(
    process.cwd(),
    briefDir,
    status.date,
    config.archive.briefFileSuffix ?? 'AI 日报',
    briefMarkdown
  );
}
fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
console.log(`[ai-brief] marked done: ${path.relative(process.cwd(), runDir)}`);
if (status.briefArchivePath) {
  console.log(`[ai-brief] archived: ${path.relative(process.cwd(), status.briefArchivePath)}`);
}

function readConfig() {
  const configPath = path.join(process.cwd(), 'configs', 'ai-radar.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
