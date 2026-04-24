import type { SessionCapabilities, ModelCapability } from '@hapi/protocol'
import { CODEX_MODEL_LABELS, CODEX_REASONING_EFFORTS } from '@hapi/protocol'
import { logger } from '../../ui/logger'
import type { CodexAppServerClient } from '../codexAppServerClient'

// Shape returned by codex app-server model/list; defensive about keys because
// the codex schema is versioned and the CLI may bump fields independently.
type RawModelEntry = {
    id?: unknown
    slug?: unknown
    name?: unknown
    label?: unknown
    display_name?: unknown
    reasoningEffortOptions?: unknown
    reasoning_effort_options?: unknown
    reasoningEfforts?: unknown
    isDefault?: unknown
    default?: unknown
}

type RawModelListResponse = {
    models?: unknown
    default?: unknown
    defaultModel?: unknown
}

type RawCollaborationModeResponse = {
    modes?: unknown
    collaborationModes?: unknown
    default?: unknown
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    const strings = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    return strings.length > 0 ? strings : undefined
}

function normalizeModelEntry(raw: unknown): ModelCapability | null {
    if (!raw || typeof raw !== 'object') return null
    const entry = raw as RawModelEntry
    const id = asString(entry.id) ?? asString(entry.slug) ?? asString(entry.name)
    if (!id) return null

    const label = asString(entry.label) ?? asString(entry.display_name) ?? asString(entry.name) ?? (CODEX_MODEL_LABELS as Record<string, string>)[id]
    const reasoningEfforts = asStringArray(entry.reasoningEffortOptions)
        ?? asStringArray(entry.reasoning_effort_options)
        ?? asStringArray(entry.reasoningEfforts)
    const isDefault = entry.isDefault === true || entry.default === true

    const capability: ModelCapability = { id }
    if (label) capability.label = label
    if (reasoningEfforts) capability.reasoningEfforts = reasoningEfforts
    if (isDefault) capability.isDefault = true
    return capability
}

function extractModels(raw: unknown): ModelCapability[] | undefined {
    const body = raw as RawModelListResponse | undefined
    const list = Array.isArray(body) ? body : body?.models
    if (!Array.isArray(list)) return undefined
    const models: ModelCapability[] = []
    for (const entry of list) {
        const model = normalizeModelEntry(entry)
        if (model) models.push(model)
    }
    return models.length > 0 ? models : undefined
}

function extractCollaborationModes(raw: unknown): string[] | undefined {
    const body = raw as RawCollaborationModeResponse | undefined
    const candidates = [body?.modes, body?.collaborationModes, Array.isArray(body) ? body : undefined]
    for (const cand of candidates) {
        const normalized = asStringArray(cand)
        if (normalized) return normalized
        if (Array.isArray(cand)) {
            const extracted = cand
                .map((entry) => typeof entry === 'string' ? entry : asString((entry as { id?: unknown })?.id))
                .filter((v): v is string => typeof v === 'string')
            if (extracted.length > 0) return extracted
        }
    }
    return undefined
}

export async function probeCodexCapabilities(client: CodexAppServerClient): Promise<SessionCapabilities> {
    const capabilities: SessionCapabilities = {
        source: 'dynamic',
        probedAt: Date.now()
    }

    try {
        const modelsResponse = await client.listModels()
        const models = extractModels(modelsResponse)
        if (models) {
            capabilities.models = models
            // Collect the union of reasoning efforts across models so UI can render a global set.
            const effortSet = new Set<string>()
            for (const m of models) {
                if (m.reasoningEfforts) {
                    for (const e of m.reasoningEfforts) effortSet.add(e)
                }
            }
            if (effortSet.size > 0) {
                capabilities.reasoningEfforts = [...effortSet]
            }
        }
    } catch (error) {
        logger.debug('[codex] model/list probe failed', error)
    }

    if (!capabilities.reasoningEfforts) {
        capabilities.reasoningEfforts = [...CODEX_REASONING_EFFORTS]
    }

    try {
        const modesResponse = await client.listCollaborationModes()
        const modes = extractCollaborationModes(modesResponse)
        if (modes) {
            capabilities.collaborationModes = modes
        }
    } catch (error) {
        logger.debug('[codex] collaborationMode/list probe failed', error)
    }

    // If the probe returned nothing useful, report static so the web can still
    // signal this was runtime-derived vs. a fallback from shared defaults.
    if (!capabilities.models && !capabilities.collaborationModes) {
        capabilities.source = 'static'
    }

    return capabilities
}
