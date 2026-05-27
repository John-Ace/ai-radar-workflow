# Agent Guide

This guide is for any agent operating AI Radar Workflow. The workflow is not tied to any specific agent.

## Role Split

- OpenCLI collects and normalizes source data.
- The workflow filters the collected data into 25 fresh candidates.
- The user's agent reads the generated input and writes the final daily brief.
- The operating system scheduler runs the workflow after setup.

## First Checks

From the repository root, run:

```bash
npm run setup -- --dry-run
npm test
```

Then test the workflow manually:

```bash
npm run ai:fetch-if-needed
npm run ai:prepare-brief
npm run ai:brief-if-needed
npm run ai:health
```

## Generating a Brief

If `AGENT_BRIEF_COMMAND` is configured, `npm run ai:brief-if-needed` calls that command automatically.

If it is not configured, the workflow prepares:

- `runs/ai-radar/<run-id>/analysis-input.md`
- `runs/ai-radar/<run-id>/selected-results.json`
- `runs/ai-radar/<run-id>/selection-report.md`
- `runs/ai-radar/<run-id>/agent-brief-prompt.md`

The agent should follow `agent-brief-prompt.md` and write:

```text
runs/ai-radar/<run-id>/ai-brief.md
```

After writing the brief, run:

```bash
npm run ai:mark-brief-done -- runs/ai-radar/<run-id>
```

## Automatic Agent Command

To let the workflow call an agent automatically, set this in `.env.local`:

```bash
AGENT_BRIEF_COMMAND=your-agent-command-that-writes-$AI_RADAR_OUTPUT
```

The command receives:

- `AI_RADAR_PROMPT`
- `AI_RADAR_RUN_DIR`
- `AI_RADAR_ANALYSIS_INPUT`
- `AI_RADAR_SELECTED_RESULTS`
- `AI_RADAR_SELECTION_REPORT`
- `AI_RADAR_TEMPLATE`
- `AI_RADAR_OUTPUT`

The command must write the final Markdown brief to `AI_RADAR_OUTPUT`.

## Brief Rules

- Generate exactly 25 items.
- Use only today or yesterday by local calendar date.
- Do not use older content to fill gaps.
- Do not include image/media sections.
- Use only collected data and visible sources.
- Mark weak sources as `需进一步确认`.

Each item must contain:

- `发生了什么`
- `为什么重要`
- `我们该关注什么`
- `今日术语解释`
- `原始来源`

## Troubleshooting

- Collection failed: run `opencli doctor`.
- No brief generated: check whether `AI 日报库/YYYY-MM-DD-AI 日报.md` already exists.
- Candidate count below 25: fix sources or rerun collection; do not fill with stale content.
- Scheduled jobs not running: inspect `logs/` and run `npm run install:automation -- --dry-run`.
- Agent command failed: inspect `agent-brief-prompt.md`, `AI_RADAR_OUTPUT`, and the agent's own logs.
