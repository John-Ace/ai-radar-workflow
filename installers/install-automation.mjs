#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const uninstall = args.has('--uninstall');
const nodeBin = process.execPath;

function main() {
  console.log(`# AI Radar automation ${uninstall ? 'uninstall' : 'install'}`);
  console.log(`- Project: ${root}`);
  console.log(`- Platform: ${process.platform}`);
  console.log(`- Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log('');

  if (process.platform === 'darwin') return macos();
  if (process.platform === 'win32') return windows();
  return linux();
}

function macos() {
  const launchDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const jobs = [
    plist('com.ai-radar.workflow.fetch', ['scripts/fetch-ai-radar-if-needed.mjs'], [{ Hour: 7, Minute: 30 }], false, 'ai-radar-fetch'),
    plist('com.ai-radar.workflow.brief', ['scripts/run-agent-brief-if-needed.mjs'], hours(9, 18, 20), false, 'ai-radar-brief'),
    plist('com.ai-radar.workflow.wakeup', ['scripts/run-ai-radar-wakeup.mjs'], null, true, 'ai-radar-wakeup'),
  ];

  if (uninstall) {
    for (const job of jobs) {
      run('launchctl', ['bootout', `gui/${process.getuid()}`, path.join(launchDir, `${job.label}.plist`)], true);
      remove(path.join(launchDir, `${job.label}.plist`));
    }
    return;
  }

  for (const job of jobs) {
    const file = path.join(launchDir, `${job.label}.plist`);
    write(file, job.content);
    run('launchctl', ['bootstrap', `gui/${process.getuid()}`, file], true);
    run('launchctl', ['enable', `gui/${process.getuid()}/${job.label}`], true);
  }
}

function plist(label, scriptArgs, schedule, runAtLoad, logName) {
  const programArgs = [nodeBin, path.join(root, scriptArgs[0])];
  const calendar = schedule
    ? Array.isArray(schedule) && schedule.length === 1
      ? dict(schedule[0])
      : `<array>\n${schedule.map((entry) => dict(entry, 2)).join('\n')}\n  </array>`
    : null;
  return {
    label,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>WorkingDirectory</key><string>${escapeXml(root)}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key><${runAtLoad ? 'true' : 'false'}/>
${calendar ? `  <key>StartCalendarInterval</key>\n  ${calendar}\n` : ''}  <key>StandardOutPath</key><string>${escapeXml(path.join(root, 'logs', `${logName}.log`))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(root, 'logs', `${logName}.err.log`))}</string>
</dict>
</plist>
`,
  };
}

function windows() {
  const tasks = [
    ['AI Radar Fetch', '07:30', 'npm run ai:fetch-if-needed'],
    ['AI Radar Brief Check', '09:20', 'npm run ai:brief-if-needed'],
    ['AI Radar Wakeup', null, 'npm run ai:wakeup'],
  ];
  if (uninstall) {
    for (const [name] of tasks) run('schtasks', ['/Delete', '/TN', name, '/F'], true);
    return;
  }
  for (const [name, time, command] of tasks) {
    const ps = `Set-Location -LiteralPath '${root.replaceAll("'", "''")}'; ${command}`;
    if (name.endsWith('Wakeup')) {
      run('schtasks', ['/Create', '/TN', name, '/SC', 'ONLOGON', '/TR', `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, '/F']);
    } else if (name.endsWith('Brief Check')) {
      run('schtasks', ['/Create', '/TN', name, '/SC', 'DAILY', '/ST', time, '/RI', '60', '/DU', '09:00', '/TR', `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, '/F']);
    } else {
      run('schtasks', ['/Create', '/TN', name, '/SC', 'DAILY', '/ST', time, '/TR', `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, '/F']);
    }
  }
}

function linux() {
  const systemdDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const hasSystemctl = spawnSync('systemctl', ['--user', '--version'], { encoding: 'utf8' }).status === 0;
  if (!hasSystemctl) return linuxCronFallback();

  const units = {
    'ai-radar-fetch.service': service('AI Radar fetch', 'npm run ai:fetch-if-needed'),
    'ai-radar-fetch.timer': timer('AI Radar fetch timer', '07:30'),
    'ai-radar-brief.service': service('AI Radar brief check', 'npm run ai:brief-if-needed'),
    'ai-radar-brief.timer': timer('AI Radar brief timer', '09..18:20'),
    'ai-radar-wakeup.service': service('AI Radar wakeup', 'npm run ai:wakeup'),
  };

  if (uninstall) {
    run('systemctl', ['--user', 'disable', '--now', 'ai-radar-fetch.timer'], true);
    run('systemctl', ['--user', 'disable', '--now', 'ai-radar-brief.timer'], true);
    for (const name of Object.keys(units)) remove(path.join(systemdDir, name));
    run('systemctl', ['--user', 'daemon-reload'], true);
    return;
  }

  for (const [name, content] of Object.entries(units)) write(path.join(systemdDir, name), content);
  run('systemctl', ['--user', 'daemon-reload']);
  run('systemctl', ['--user', 'enable', '--now', 'ai-radar-fetch.timer']);
  run('systemctl', ['--user', 'enable', '--now', 'ai-radar-brief.timer']);
  console.log('For login/startup catch-up, enable ai-radar-wakeup.service from your desktop/session startup if desired.');
}

function linuxCronFallback() {
  const lines = [
    `30 7 * * * cd ${shellQuote(root)} && npm run ai:fetch-if-needed >> logs/ai-radar-fetch.log 2>> logs/ai-radar-fetch.err.log`,
    `20 9-18 * * * cd ${shellQuote(root)} && npm run ai:brief-if-needed >> logs/ai-radar-brief.log 2>> logs/ai-radar-brief.err.log`,
    `@reboot cd ${shellQuote(root)} && npm run ai:wakeup >> logs/ai-radar-wakeup.log 2>> logs/ai-radar-wakeup.err.log`,
  ];
  console.log('systemd --user is unavailable. Add these cron lines manually:');
  for (const line of lines) console.log(line);
}

function service(description, command) {
  return `[Unit]
Description=${description}

[Service]
Type=oneshot
WorkingDirectory=${root}
ExecStart=/usr/bin/env bash -lc '${command.replaceAll("'", "'\\''")}'
`;
}

function timer(description, time) {
  return `[Unit]
Description=${description}

[Timer]
OnCalendar=*-*-* ${time}:00
Persistent=true

[Install]
WantedBy=timers.target
`;
}

function hours(start, end, minute) {
  const out = [];
  for (let hour = start; hour <= end; hour += 1) out.push({ Hour: hour, Minute: minute });
  return out;
}

function dict(entry, indent = 1) {
  const pad = '  '.repeat(indent);
  return `${pad}<dict><key>Hour</key><integer>${entry.Hour}</integer><key>Minute</key><integer>${entry.Minute}</integer></dict>`;
}

function write(file, content) {
  console.log(`${dryRun ? 'would write' : 'write'}: ${file}`);
  if (dryRun) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function remove(file) {
  console.log(`${dryRun ? 'would remove' : 'remove'}: ${file}`);
  if (!dryRun) fs.rmSync(file, { force: true });
}

function run(command, commandArgs, allowFailure = false) {
  console.log(`${dryRun ? 'would run' : 'run'}: ${[command, ...commandArgs].join(' ')}`);
  if (dryRun) return;
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) process.exitCode = result.status ?? 1;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

main();
