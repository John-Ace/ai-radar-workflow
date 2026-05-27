---
name: ai-radar-daily
description: Install, configure, operate, and troubleshoot AI Radar Workflow, a local OpenCLI + agent automation that collects AI information, selects 25 fresh daily candidates, generates a Chinese AI daily brief with the user's preferred agent, archives outputs, and optionally installs cross-platform scheduled tasks. Use when the user asks to set up AI daily reports, OpenCLI AI crawling, agent-based daily brief generation, AI Radar Workflow automation, scheduled AI news collection, or debug why an AI Radar daily brief did not run.
---

# AI Radar Daily

Use this Skill as the operations guide for AI Radar Workflow. The workflow scripts do the scheduled work; this Skill helps Codex install, configure, run, and debug it. Codex is optional as a generator; the workflow can call any agent command through `AGENT_BRIEF_COMMAND`.

## Core Workflow

1. Confirm the repository root contains `package.json`, `configs/ai-radar.json`, `scripts/`, and `templates/ai-radar-daily.md`.
2. Run setup first:

```bash
npm run setup
```

3. Test the manual workflow:

```bash
npm run ai:fetch-if-needed
npm run ai:prepare-brief
npm run ai:brief-if-needed
npm run ai:health
```

4. Install automation only after manual checks work:

```bash
npm run install:automation -- --dry-run
npm run install:automation
```

## Output Locations

- Crawl archive: `opencli 数据爬取库/YYYY-MM-DD-数据爬取.md`
- Agent brief archive: `AI 日报库/YYYY-MM-DD-AI 日报.md`
- Traceable run files: `runs/ai-radar/<run-id>/`
- Logs: `logs/`

## Daily Brief Requirements

- Generate exactly 25 items.
- Use only today or yesterday by local calendar date.
- Do not use older content to fill gaps.
- Do not include image/media sections.
- Each item must include:
  - `发生了什么`: one list item.
  - `为什么重要`: two list items; first explains importance, second explains trend.
  - `我们该关注什么`: one list item.
  - `今日术语解释`: one plain-language explanation list item.
  - `原始来源`: source link list item.

## Troubleshooting

- If collection fails, run `opencli doctor`.
- If agent generation is skipped, check whether today already has `AI 日报库/YYYY-MM-DD-AI 日报.md`.
- If candidates are below 25, do not generate a brief from older content; fix sources or rerun collection.
- If automatic generation is not running, set `AGENT_BRIEF_COMMAND` to the command for the user's preferred agent.
- If scheduled jobs do not run, inspect `logs/` and rerun `npm run install:automation -- --dry-run`.

For platform automation details, read `references/automation.md`.
