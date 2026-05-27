import { spawnSync } from 'node:child_process';

const AGENT_PRESETS = [
  {
    id: 'workbuddy',
    label: 'WorkBuddy',
    binaries: ['workbuddy'],
    envHints: ['WORKBUDDY', 'WORKBUDDY_SESSION_ID', 'WORKBUDDY_PROJECT_DIR'],
    pathHints: ['/WorkBuddy/'],
    command: 'workbuddy agent --prompt "$AI_RADAR_PROMPT" --output "$AI_RADAR_OUTPUT"',
  },
  {
    id: 'claude',
    label: 'Claude Code',
    binaries: ['claude'],
    envHints: ['CLAUDE_CODE_ENTRYPOINT', 'CLAUDECODE', 'CLAUDE_CODE_SSE_PORT'],
    pathHints: ['/Claude/'],
    command: 'claude -p --permission-mode acceptEdits --allowedTools Read,Write,Edit,Bash "$(cat "$AI_RADAR_PROMPT")"',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    binaries: ['codex'],
    envHints: ['CODEX_SHELL', 'CODEX_THREAD_ID', 'CODEX_CI'],
    pathHints: ['/Codex/'],
    command: 'codex exec -C "$AI_RADAR_ROOT" --sandbox workspace-write --ask-for-approval never - < "$AI_RADAR_PROMPT"',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    binaries: ['openclaw'],
    envHints: ['OPENCLAW_STATE_DIR', 'OPENCLAW_CONFIG_PATH', 'OPENCLAW_CONTAINER'],
    pathHints: ['/OpenClaw/', '/openclaw/'],
    command: 'openclaw agent --local --timeout 2700 --message "$(cat "$AI_RADAR_PROMPT")"',
  },
];

export function detectAgentCommand(options = {}) {
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const cwd = normalizePath(options.cwd ?? process.cwd());
  const preferred = normalizeAgentId(env.AI_RADAR_AGENT);
  if (preferred) {
    const preset = AGENT_PRESETS.find((entry) => entry.id === preferred);
    if (preset) return buildDetection(preset, commandExists, 'AI_RADAR_AGENT');
  }

  const environmentMatches = AGENT_PRESETS
    .map((preset) => ({ preset, score: scorePreset(preset, env, cwd) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (environmentMatches.length > 0) {
    return buildDetection(environmentMatches[0].preset, commandExists, 'current environment');
  }

  for (const preset of AGENT_PRESETS) {
    const detection = buildDetection(preset, commandExists, 'installed CLI');
    if (detection.runnable) return detection;
  }

  return null;
}

export function listAgentPresets() {
  return AGENT_PRESETS.map(({ id, label, binaries }) => ({ id, label, binaries: [...binaries] }));
}

function buildDetection(preset, commandExists, source) {
  const runnable = preset.binaries.some((bin) => commandExists(bin));
  return {
    id: preset.id,
    label: preset.label,
    command: runnable ? preset.command : '',
    source,
    runnable,
  };
}

function scorePreset(preset, env, cwd) {
  let score = 0;
  for (const key of preset.envHints) {
    if (env[key]) score += 10;
  }
  for (const hint of preset.pathHints ?? []) {
    if (cwd.includes(normalizePath(hint))) score += 100;
  }
  return score;
}

function normalizeAgentId(value) {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
  return normalized === 'auto' ? '' : normalized;
}

function defaultCommandExists(bin) {
  const result = spawnSync(commandCheck(bin), {
    shell: true,
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function commandCheck(bin) {
  if (process.platform === 'win32') return `where ${quoteForShell(bin)}`;
  return `command -v ${quoteForShell(bin)}`;
}

function quoteForShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
