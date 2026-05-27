# AI Radar Workflow

AI Radar Workflow is a local automation workflow for collecting AI industry signals with OpenCLI, selecting fresh high-value items, and generating a structured Chinese daily brief with your preferred agent.

It is a workflow package. OpenCLI does the collection and filtering; any capable agent can read the prepared input and write the final daily brief.

## What It Does

- Collects AI updates from official sources, RSS feeds, model/tool sources, GitHub, and selected community sources.
- Keeps raw run artifacts under `runs/ai-radar/`.
- Archives the daily crawl report to `opencli 数据爬取库/YYYY-MM-DD-数据爬取.md`.
- Selects exactly 25 fresh candidates from today or yesterday.
- Generates a Chinese AI daily brief to `AI 日报库/YYYY-MM-DD-AI 日报.md`.
- Supports optional local scheduling on macOS, Windows, and Linux.

## Requirements

- Node.js 20+
- npm
- OpenCLI available as `opencli`
- Optional: an agent CLI command configured via `AGENT_BRIEF_COMMAND` for fully automatic brief generation.

Some sources, such as Twitter/X, may depend on OpenCLI browser bridge login state. Run `opencli doctor` first when collection fails.

## Install

```bash
git clone <your-github-repo-url>
cd ai-radar-workflow
npm install
npm run setup
```

Preview setup without writing runtime files:

```bash
npm run setup -- --dry-run
```

## Manual Run

Collect data if needed:

```bash
npm run ai:fetch-if-needed
```

Prepare the latest pending run for an agent:

```bash
npm run ai:prepare-brief
```

Generate the daily brief if needed. If `AGENT_BRIEF_COMMAND` is configured, the workflow calls that agent command. Otherwise it writes `agent-brief-prompt.md` and waits for any agent to generate `ai-brief.md`.

```bash
npm run ai:brief-if-needed
```

Agent commands receive these environment variables:

- `AI_RADAR_PROMPT`
- `AI_RADAR_RUN_DIR`
- `AI_RADAR_ANALYSIS_INPUT`
- `AI_RADAR_SELECTED_RESULTS`
- `AI_RADAR_SELECTION_REPORT`
- `AI_RADAR_TEMPLATE`
- `AI_RADAR_OUTPUT`

The agent command must write the final Markdown brief to `AI_RADAR_OUTPUT`.

Run the login/wakeup catch-up flow:

```bash
npm run ai:wakeup
```

Check health:

```bash
npm run ai:health
```

## Optional Automation

Preview platform-specific scheduled tasks:

```bash
npm run install:automation -- --dry-run
```

Install scheduled tasks:

```bash
npm run install:automation
```

Remove scheduled tasks:

```bash
npm run install:automation -- --uninstall
```

Platform behavior:

- macOS: installs LaunchAgent jobs.
- Windows: installs Task Scheduler jobs.
- Linux: installs systemd user timers when available; otherwise prints cron fallback lines.

All platforms call the same npm scripts:

- 7:30 daily: `npm run ai:fetch-if-needed`
- 9:20-18:20 hourly: `npm run ai:brief-if-needed`
- Login/startup catch-up: `npm run ai:wakeup`

## Daily Brief Format

The daily brief must contain exactly 25 items. It must not use older content to fill the quota, and it does not include image sections.

Each item uses this structure:

```markdown
**发生了什么：**
- 主体发布或更新了什么，关键变化是什么，证据来自哪里。

**为什么重要：**
- 这件事影响了哪些能力、产品、生态或工作流。
- 它反映了什么趋势，例如 Agent 化、模型产品化或企业落地加速。

**我们该关注什么：**
- 对工具选择、工作流设计、内容判断或后续跟踪有什么启发。

**今日术语解释：**
- 术语：用通俗语言解释，可以给简单例子。

**原始来源：**
- 来源名称与链接。
```

## Runtime Files

These are intentionally ignored by Git:

- `runs/`
- `logs/`
- `opencli 数据爬取库/`
- `AI 日报库/`
- `.env.local`

Do not commit browser cookies, tokens, personal logs, or generated daily reports unless you intentionally create sanitized examples.

## Agent Guide

This repository is designed for any agent that can read project files and run local commands. Start with:

- `AGENTS.md` for project rules.
- `docs/agent-guide.md` for setup, operation, and troubleshooting.

The operating system scheduler runs the workflow after setup, and the analysis layer can be handled by any agent that follows the generated prompt and writes `ai-brief.md`.
