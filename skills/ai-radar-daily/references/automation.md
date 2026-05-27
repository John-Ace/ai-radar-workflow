# Automation Reference

AI Radar Workflow uses OS-level scheduling. The Skill is not a background service.

## macOS

Use:

```bash
npm run install:automation
```

This creates LaunchAgent jobs for fetch, brief checks, and login catch-up.

## Windows

Use the same command from PowerShell or a terminal where Node/npm are available.

The installer creates Task Scheduler jobs:

- `AI Radar Fetch`
- `AI Radar Brief Check`
- `AI Radar Wakeup`

## Linux

The installer prefers systemd user timers. If unavailable, it prints cron fallback lines.

Use dry-run first:

```bash
npm run install:automation -- --dry-run
```

## Safety

All scheduled tasks call the same npm scripts in the project root. They should not duplicate workflow logic.
