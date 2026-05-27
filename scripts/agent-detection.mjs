import { spawnSync } from 'node:child_process';

const AGENT_PRESETS = [
  {
    id: 'claude',
    label: 'Claude Code',
    binaries: ['claude'],
    envHints: ['CLAUDE_CODE_ENTRYPOINT', 'CLAUDECODE', 'CLAUDE_CODE_SSE_PORT'],
    command: 'claude -p --permission-mode acceptEdits --allowedTools Read,Write,Edit,Bash "$(cat "$AI_RADAR_PROMPT")"',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    binaries: ['codex'],
    envHints: ['CODEX_SHELL', 'CODEX_THREAD_ID', 'CODEX_CI'],
    command: 'codex exec -C "$AI_RADAR_ROOT" --sandbox workspace-write --ask-for-approval never - < "$AI_RADAR_PROMPT"',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    binaries: ['openclaw'],
    envHints: ['OPENCLAW_STATE_DIR', 'OPENCLAW_CONFIG_PATH', 'OPENCLAW_CONTAINER'],
    command: 'openclaw agent --local --timeout 2700 --message "$(cat "$AI_RADAR_PROMPT")"',
  },
];

export function detectAgentCommand(options = {}) {
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const preferred = normalizeAgentId(env.AI_RADAR_AGENT);
  const presets = preferred
    ? [...AGENT_PRESETS].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0))
    : [...AGENT_PRESETS].sort((a, b) => scorePreset(b, env) - scorePreset(a, env));

  for (const preset of presets) {
    if (preset.binaries.some((bin) => commandExists(bin))) {
      return {
        id: preset.id,
        label: preset.label,
        command: preset.command,
        source: preferred === preset.id ? 'AI_RADAR_AGENT' : scorePreset(preset, env) > 0 ? 'current environment' : 'installed CLI',
      };
    }
  }

  return null;
}

export function listAgentPresets() {
  return AGENT_PRESETS.map(({ id, label, binaries }) => ({ id, label, binaries: [...binaries] }));
}

function scorePreset(preset, env) {
  let score = 0;
  for (const key of preset.envHints) {
    if (env[key]) score += 10;
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

function commandCheck(bin) {
  if (process.platform === 'win32') return `where ${quoteForShell(bin)}`;
  return `command -v ${quoteForShell(bin)}`;
}

function quoteForShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
