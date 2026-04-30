import { MODEL_OPTIONS } from '@/components/NewSession/types'
import { getClaudeComposerModelOptions, getNextClaudeComposerModel } from './claudeModelOptions'
import type { ClaudeComposerModelOption } from './claudeModelOptions'
import { getModelDisplayLabel, type SessionCapabilities } from '@hapi/protocol'

export type ModelOption = ClaudeComposerModelOption

function normalizeCurrentModel(model?: string | null): string | null {
    const trimmedModel = model?.trim()
    if (!trimmedModel || trimmedModel === 'auto' || trimmedModel === 'default') {
        return null
    }

    return trimmedModel
}

function withCurrentModelOption(options: ModelOption[], currentModel?: string | null): ModelOption[] {
    const normalizedCurrentModel = normalizeCurrentModel(currentModel)
    if (!normalizedCurrentModel || options.some((option) => option.value === normalizedCurrentModel)) {
        return options
    }

    const nextOptions = [...options]
    const autoIndex = nextOptions.findIndex((option) => option.value === null)
    nextOptions.splice(autoIndex >= 0 ? autoIndex + 1 : 0, 0, {
        value: normalizedCurrentModel,
        label: normalizedCurrentModel
    })
    return nextOptions
}

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
            label: getModelDisplayLabel(model.id, model.label) ?? model.id
        }))
    ]
    return withCurrentModelOption(options, currentModel)
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
    return withCurrentModelOption(options, currentModel)
}

function getNextGeminiModel(currentModel?: string | null, capabilities?: SessionCapabilities): string | null {
    const options = getGeminiModelOptions(currentModel, capabilities)
    const currentIndex = options.findIndex((option) => option.value === (normalizeCurrentModel(currentModel) ?? null))
    if (currentIndex === -1) {
        return options.find((option) => option.value !== null)?.value ?? null
    }
    return options[(currentIndex + 1) % options.length]?.value ?? null
}

function getCodexModelOptions(currentModel?: string | null, capabilities?: SessionCapabilities): ModelOption[] {
    return getRuntimeModelOptions(currentModel, capabilities, { includeAuto: false }) ?? []
}

function getNextCodexModel(currentModel?: string | null, capabilities?: SessionCapabilities): string | null {
    const options = getCodexModelOptions(currentModel, capabilities)
    const currentIndex = options.findIndex((option) => option.value === (normalizeCurrentModel(currentModel) ?? null))
    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }
    return options[(currentIndex + 1) % options.length]?.value ?? null
}

export function getModelOptionsForFlavor(
    flavor: string | undefined | null,
    currentModel?: string | null,
    capabilities?: SessionCapabilities,
    customOptions?: ModelOption[]
): ModelOption[] {
    if (customOptions && customOptions.length > 0) {
        return withCurrentModelOption(customOptions, currentModel)
    }
    if (flavor === 'gemini') {
        return getGeminiModelOptions(currentModel, capabilities)
    }
    if (flavor === 'codex') {
        return getCodexModelOptions(currentModel, capabilities)
    }
    return getClaudeComposerModelOptions(currentModel)
}

export function getNextModelForFlavor(
    flavor: string | undefined | null,
    currentModel?: string | null,
    capabilities?: SessionCapabilities,
    customOptions?: ModelOption[]
): string | null {
    if (customOptions && customOptions.length > 0) {
        const options = getModelOptionsForFlavor(flavor, currentModel, capabilities, customOptions)
        const currentIndex = options.findIndex((option) => option.value === (normalizeCurrentModel(currentModel) ?? null))
        if (currentIndex === -1) {
            return options.find((option) => option.value !== null)?.value ?? null
        }
        return options[(currentIndex + 1) % options.length]?.value ?? null
    }
    if (flavor === 'gemini') {
        return getNextGeminiModel(currentModel, capabilities)
    }
    if (flavor === 'codex') {
        return getNextCodexModel(currentModel, capabilities)
    }
    return getNextClaudeComposerModel(currentModel)
}
