#!/usr/bin/env node

import path from 'node:path';
import {
  collectSource,
  createRunDir,
  loadJson,
  writeRunFiles,
} from './ai-radar-lib.mjs';
import { buildSelection, writeSelectionFiles } from './filter-ai-radar.mjs';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv(process.cwd());

async function main() {
  const configPath = process.argv[2] ?? 'configs/ai-radar.json';
  const config = loadJson(configPath);
  const generatedAt = new Date();
  const runDir = createRunDir(config.outputDir, generatedAt);
  const results = [];

  console.log(`[ai-radar] config: ${configPath}`);
  console.log(`[ai-radar] run: ${path.relative(process.cwd(), runDir)}`);

  for (const source of config.sources) {
    if (source.enabled === false) continue;
    process.stdout.write(`[ai-radar] ${source.name} ... `);
    const result = await collectSource(source, config);
    results.push(result);
    console.log(result.ok ? `ok (${result.count})` : `failed (${result.error})`);
  }

  const status = writeRunFiles(runDir, config, results, generatedAt);
  if (status.totalItems > 0) {
    const selection = buildSelection({ config, results }, { referenceTime: generatedAt });
    writeSelectionFiles(runDir, selection);
    console.log(`[ai-radar] selected: ${selection.selectedItems}/${selection.config.targetItems}`);
  }
  console.log('');
  console.log(`[ai-radar] status: ${status.collectionStatus}`);
  console.log(`[ai-radar] sources: ${status.okSources}/${status.totalSources}`);
  console.log(`[ai-radar] items: ${status.totalItems}`);
  console.log(`[ai-radar] report: ${path.relative(process.cwd(), path.join(runDir, 'basic-report.md'))}`);
  console.log(`[ai-radar] status file: ${path.relative(process.cwd(), path.join(runDir, 'status.json'))}`);
}

main().catch((err) => {
  console.error(`[ai-radar] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
