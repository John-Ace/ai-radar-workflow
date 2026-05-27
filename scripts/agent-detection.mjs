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
    return buildGenericDetection(preferred, labelFromId(preferred), commandExists, 'AI_RADAR_AGENT');
  }

  const genericContext = detectGenericAgentContext(env, cwd);
  if (genericContext) {
    const preset = AGENT_PRESETS.find((entry) => entry.id === genericContext.id);
    if (preset) return buildDetection(preset, commandExists, genericContext.source);
    return buildGenericDetection(genericContext.id, genericContext.label, commandExists, genericContext.source);
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

function detectGenericAgentContext(env, cwd) {
  const envName = firstNonEmpty([
    env.AI_RADAR_CURRENT_AGENT,
    env.CURRENT_AGENT,
    env.AGENT_NAME,
    env.AGENT_APP,
  ]);
  if (envName) {
    const id = normalizeAgentId(envName);
    return { id, label: labelFromId(id), source: 'current environment' };
  }

  const pathName = inferAgentNameFromPath(cwd);
  if (pathName) {
    const id = normalizeAgentId(pathName);
    return { id, label: labelFromId(id), source: 'current environment' };
  }

  return null;
}

function inferAgentNameFromPath(cwd) {
  const parts = normalizePath(cwd).split('/').filter(Boolean);
  const repoIndex = parts.lastIndexOf('ai-radar-workflow');
  if (repoIndex < 2) return '';

  const parent = parts[repoIndex - 1];
  const grandparent = parts[repoIndex - 2];
  if (looksLikeRunFolder(parent) && isUsableAgentName(grandparent)) return grandparent;
  if (isUsableAgentName(parent) && !isGenericFolder(parent)) return parent;
  return '';
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

function buildGenericDetection(id, label, commandExists, source) {
  const binary = id;
  const runnable = commandExists(binary);
  return {
    id,
    label,
    command: runnable ? `${binary} "$AI_RADAR_PROMPT"` : '',
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

function firstNonEmpty(values) {
  return values.find((value) => String(value ?? '').trim()) ?? '';
}

function looksLikeRunFolder(value) {
  return /^\d{4}-\d{2}-\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2}$/.test(value);
}

function isUsableAgentName(value) {
  return /^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(value);
}

function isGenericFolder(value) {
  return ['Desktop', 'Documents', 'Downloads', 'Projects', 'Code', 'src', 'repo', 'repos'].includes(value);
}

function labelFromId(id) {
  return String(id)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
