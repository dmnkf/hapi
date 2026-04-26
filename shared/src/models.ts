export const CLAUDE_MODEL_LABELS = {
    sonnet: 'Sonnet',
    'sonnet[1m]': 'Sonnet 1M',
    opus: 'Opus',
    'opus[1m]': 'Opus 1M'
} as const

export type ClaudeModelPreset = keyof typeof CLAUDE_MODEL_LABELS
export const CLAUDE_MODEL_PRESETS = Object.keys(CLAUDE_MODEL_LABELS) as ClaudeModelPreset[]

export const GEMINI_MODEL_LABELS = {
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
} as const

export type GeminiModelPreset = keyof typeof GEMINI_MODEL_LABELS
export const GEMINI_MODEL_PRESETS = Object.keys(GEMINI_MODEL_LABELS) as GeminiModelPreset[]
export const DEFAULT_GEMINI_MODEL: GeminiModelPreset = 'gemini-2.5-pro'

// Static fallback list for Codex models. The authoritative list should come from
// the running Codex runtime (ACP config options / model state) exposed as
// SessionCapabilities; web prefers that when available and falls back here
// before a session exists.
export const CODEX_MODEL_LABELS = {
    'gpt-5.5': 'GPT-5.5',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gpt-5.3-codex': 'GPT-5.3 Codex',
    'gpt-5.3-codex-spark': 'GPT-5.3 Codex Spark',
    'gpt-5.2-codex': 'GPT-5.2 Codex',
    'gpt-5.2': 'GPT-5.2',
    'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
    'gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini',
} as const

export type CodexModelPreset = keyof typeof CODEX_MODEL_LABELS
export const CODEX_MODEL_PRESETS = Object.keys(CODEX_MODEL_LABELS) as CodexModelPreset[]

// Codex reasoning efforts — hard enum accepted by codex app-server.
// Must stay aligned with cli/src/codex/appServerTypes.ts ReasoningEffort.
export const CODEX_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type CodexReasoningEffort = typeof CODEX_REASONING_EFFORTS[number]

export const CODEX_REASONING_EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh'
}

// Claude effort values — CLI normalizes 'auto'/'default' to null, passes other
// strings through. Keep a curated set for the UI.
export const CLAUDE_EFFORT_PRESETS = ['medium', 'high', 'max'] as const
export type ClaudeEffortPreset = typeof CLAUDE_EFFORT_PRESETS[number]

export const CLAUDE_EFFORT_LABELS: Record<ClaudeEffortPreset, string> = {
    medium: 'Medium',
    high: 'High',
    max: 'Max'
}

export function isClaudeModelPreset(model: string | null | undefined): model is ClaudeModelPreset {
    return typeof model === 'string' && Object.hasOwn(CLAUDE_MODEL_LABELS, model)
}

export function getClaudeModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return CLAUDE_MODEL_LABELS[trimmedModel as ClaudeModelPreset] ?? null
}

export function isCodexModelPreset(model: string | null | undefined): model is CodexModelPreset {
    return typeof model === 'string' && Object.hasOwn(CODEX_MODEL_LABELS, model)
}

export function getCodexModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) return null
    return CODEX_MODEL_LABELS[trimmedModel as CodexModelPreset] ?? null
}

export function isCodexReasoningEffort(value: string | null | undefined): value is CodexReasoningEffort {
    return typeof value === 'string' && (CODEX_REASONING_EFFORTS as readonly string[]).includes(value)
}
