import { MODEL_OPTIONS } from '@/components/NewSession/types'
import { getClaudeComposerModelOptions, getNextClaudeComposerModel } from './claudeModelOptions'
import type { ClaudeComposerModelOption } from './claudeModelOptions'
import type { SessionCapabilities } from '@hapi/protocol'

export type ModelOption = ClaudeComposerModelOption

function getRuntimeModelOptions(
    currentModel?: string | null,
    capabilities?: SessionCapabilities,
    opts?: { includeAuto?: boolean; autoLabel?: string }
): ModelOption[] | null {
    const runtimeModels = capabilities?.models
    if (!runtimeModels || runtimeModels.length === 0) {
        return null
    }

    const options = [
        ...(opts?.includeAuto === false ? [] : [{ value: null, label: opts?.autoLabel ?? 'Auto' }]),
        ...runtimeModels.map((model) => ({
            value: model.id,
            label: model.label ?? model.id
        }))
    ]
    const normalized = currentModel?.trim() || null
    if (normalized && !options.some((option) => option.value === normalized)) {
        options.splice(1, 0, { value: normalized, label: normalized })
    }
    return options
}

function getGeminiModelOptions(currentModel?: string | null, capabilities?: SessionCapabilities): ModelOption[] {
    const runtimeOptions = getRuntimeModelOptions(currentModel, capabilities)
    if (runtimeOptions) {
        return runtimeOptions
    }

    const options = MODEL_OPTIONS.gemini.map((m) => ({
        value: m.value === 'auto' ? null : m.value,
        label: m.label
    }))
    const normalized = currentModel?.trim() || null
    if (normalized && !options.some((o) => o.value === normalized)) {
        options.splice(1, 0, { value: normalized, label: normalized })
    }
    return options
}

function getNextGeminiModel(currentModel?: string | null, capabilities?: SessionCapabilities): string | null {
    const options = getGeminiModelOptions(currentModel, capabilities)
    const currentIndex = options.findIndex((o) => o.value === (currentModel ?? null))
    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }
    return options[(currentIndex + 1) % options.length]?.value ?? null
}

function getCodexModelOptions(currentModel?: string | null, capabilities?: SessionCapabilities): ModelOption[] {
    return getRuntimeModelOptions(currentModel, capabilities, { includeAuto: false }) ?? []
}

function getNextCodexModel(currentModel?: string | null, capabilities?: SessionCapabilities): string | null {
    const options = getCodexModelOptions(currentModel, capabilities)
    const currentIndex = options.findIndex((o) => o.value === (currentModel ?? null))
    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }
    return options[(currentIndex + 1) % options.length]?.value ?? null
}

export function getModelOptionsForFlavor(flavor: string | undefined | null, currentModel?: string | null, capabilities?: SessionCapabilities): ModelOption[] {
    if (flavor === 'gemini') {
        return getGeminiModelOptions(currentModel, capabilities)
    }
    if (flavor === 'codex') {
        return getCodexModelOptions(currentModel, capabilities)
    }
    return getClaudeComposerModelOptions(currentModel)
}

export function getNextModelForFlavor(flavor: string | undefined | null, currentModel?: string | null, capabilities?: SessionCapabilities): string | null {
    if (flavor === 'gemini') {
        return getNextGeminiModel(currentModel, capabilities)
    }
    if (flavor === 'codex') {
        return getNextCodexModel(currentModel, capabilities)
    }
    return getNextClaudeComposerModel(currentModel)
}
