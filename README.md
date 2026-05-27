# AI Radar Workflow

AI Radar Workflow is a local automation workflow for collecting AI industry signals with OpenCLI, selecting fresh high-value items, and generating a structured Chinese daily brief with Codex.

It is a workflow package, not only a Codex Skill. The workflow scripts do the scheduled work; the optional Skill helps Codex install, operate, and debug the workflow.

## What It Does

- Collects AI updates from official sources, RSS feeds, model/tool sources, GitHub, and selected community sources.
- Keeps raw run artifacts under `runs/ai-radar/`.
- Archives the daily crawl report to `opencli 数据爬取库/YYYY-MM-DD-数据爬取.md`.
- Selects exactly 25 fresh candidates from today or yesterday.
- Generates a Chinese AI daily brief to `Codex AI日报库/YYYY-MM-DD-AI 日报.md`.
- Supports optional local scheduling on macOS, Windows, and Linux.

## Requirements

- Node.js 20+
- npm
- OpenCLI available as `opencli`
- Codex CLI available as `codex`, or set `CODEX_CLI` in your shell or `.env.local`

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

Prepare the latest pending run for Codex:

```bash
npm run ai:prepare-brief
```

Generate the daily brief if needed:

```bash
npm run ai:brief-if-needed
```

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
- 一条黑点，讲完整事件。

**为什么重要：**
- 第一条黑点：说明为什么重要。
- 第二条黑点：说明反映了什么趋势。

**我们该关注什么：**
- 一条黑点，说明关注点。

**今日术语解释：**
- 术语：通俗解释。

**原始来源：**
- 来源链接。
```

## Runtime Files

These are intentionally ignored by Git:

- `runs/`
- `logs/`
- `opencli 数据爬取库/`
- `Codex AI日报库/`
- `.env.local`

Do not commit browser cookies, tokens, personal logs, or generated daily reports unless you intentionally create sanitized examples.

## Codex Skill

An optional Skill is included at `skills/ai-radar-daily/`. Install or copy it into your Codex skills folder if you want Codex to act as an installation and operations assistant for this workflow.

The Skill is not the scheduler. The operating system scheduler runs the workflow after setup.
