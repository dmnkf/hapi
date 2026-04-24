import {
    CODEX_REASONING_EFFORTS,
    CODEX_REASONING_EFFORT_LABELS,
    type SessionCapabilities,
} from '@hapi/protocol'

export type CodexComposerReasoningEffortOption = {
    value: string | null
    label: string
}

function normalizeCodexComposerReasoningEffort(effort?: string | null): string | null {
    const trimmedEffort = effort?.trim().toLowerCase()
    if (!trimmedEffort || trimmedEffort === 'default') {
        return null
    }

    return trimmedEffort
}

function formatCodexReasoningEffortLabel(effort: string): string {
    return CODEX_REASONING_EFFORT_LABELS[effort as keyof typeof CODEX_REASONING_EFFORT_LABELS]
        ?? `${effort.charAt(0).toUpperCase()}${effort.slice(1)}`
}

export function getCodexComposerReasoningEffortOptions(
    currentEffort?: string | null,
    capabilities?: SessionCapabilities
): CodexComposerReasoningEffortOption[] {
    const normalizedCurrentEffort = normalizeCodexComposerReasoningEffort(currentEffort)
    // Prefer runtime-reported efforts when present; fall back to the shared enum.
    const presets = capabilities?.reasoningEfforts && capabilities.reasoningEfforts.length > 0
        ? capabilities.reasoningEfforts
        : (CODEX_REASONING_EFFORTS as readonly string[])

    const options: CodexComposerReasoningEffortOption[] = [
        { value: null, label: 'Default' }
    ]

    if (
        normalizedCurrentEffort
        && !presets.includes(normalizedCurrentEffort)
    ) {
        options.push({
            value: normalizedCurrentEffort,
            label: formatCodexReasoningEffortLabel(normalizedCurrentEffort)
        })
    }

    options.push(...presets.map((effort) => ({
        value: effort,
        label: formatCodexReasoningEffortLabel(effort)
    })))

    return options
}
