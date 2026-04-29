import {
    CLAUDE_EFFORT_LABELS,
    CLAUDE_EFFORT_PRESETS,
    CLAUDE_MODEL_LABELS,
    CODEX_MODEL_LABELS,
    CODEX_MODEL_PRESETS,
    CODEX_REASONING_EFFORTS,
    CODEX_REASONING_EFFORT_LABELS,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_PRESETS,
} from '@hapi/protocol'

export type AgentType = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
export type SessionType = 'simple' | 'worktree'
// Composer carries the literal enum the CLI validates against, plus a 'default'
// sentinel the UI collapses to null before sending.
export type CodexReasoningEffort = 'default' | typeof CODEX_REASONING_EFFORTS[number]
export type ClaudeEffort = 'auto' | typeof CLAUDE_EFFORT_PRESETS[number]

// UI display order; labels come from shared so there's only one place to update.
const CLAUDE_DISPLAY_ORDER = ['opus', 'opus[1m]', 'sonnet', 'sonnet[1m]'] as const

export const MODEL_OPTIONS: Record<AgentType, { value: string; label: string }[]> = {
    claude: [
        { value: 'auto', label: 'Default' },
        ...CLAUDE_DISPLAY_ORDER.map(m => ({ value: m, label: CLAUDE_MODEL_LABELS[m] })),
    ],
    codex: [
        { value: 'auto', label: 'Default' },
        ...CODEX_MODEL_PRESETS.map(m => ({ value: m, label: CODEX_MODEL_LABELS[m] })),
    ],
    cursor: [],
    gemini: [
        { value: 'auto', label: 'Default' },
        ...GEMINI_MODEL_PRESETS.map(m => ({ value: m, label: GEMINI_MODEL_LABELS[m] })),
    ],
    opencode: [],
}

export const CODEX_REASONING_EFFORT_OPTIONS: { value: CodexReasoningEffort; label: string }[] = [
    { value: 'default', label: 'Default' },
    ...CODEX_REASONING_EFFORTS.map(e => ({ value: e, label: CODEX_REASONING_EFFORT_LABELS[e] })),
]

export const CLAUDE_EFFORT_OPTIONS: { value: ClaudeEffort; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    ...CLAUDE_EFFORT_PRESETS.map(e => ({ value: e, label: CLAUDE_EFFORT_LABELS[e] })),
]
