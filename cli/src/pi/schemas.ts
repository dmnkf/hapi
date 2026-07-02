/**
 * Zod schemas for Pi RPC protocol parsing.
 *
 * All unknown→typed conversions happen here via Zod schemas,
 * so downstream code works with validated data only.
 *
 * The Pi protocol is not version-stable. Use field-level tolerance so invalid
 * optional fields are dropped instead of rejecting the whole event.
 */

import { z } from 'zod';
import { PI_THINKING_LEVELS } from '@hapi/protocol';
import type { PiModelSummary } from '@hapi/protocol/apiTypes';

// ============================================================================
// Field-level tolerant schemas
// ============================================================================

/** Extract a string value, returning undefined for missing or non-string input. */
const asOptStr = z.unknown().optional().transform(v => typeof v === 'string' ? v : undefined);

/** Extract a number value, returning undefined for missing or non-number input. */
const asOptNum = z.unknown().optional().transform(v => typeof v === 'number' ? v : undefined);

/** Extract a boolean value, returning undefined for missing or non-boolean input. */
const asOptBool = z.unknown().optional().transform(v => typeof v === 'boolean' ? v : undefined);

/** Extract a string value, returning the provided default for missing or non-string input. */
const asStrOrDef = (def: string) => z.unknown().optional().transform(v => typeof v === 'string' ? v : def);

/** Extract a valid thinkingLevelMap, returning undefined for missing or invalid input. */
const asOptThinkingLevelMap = z.unknown().optional().transform((v): Record<string, string | null> | undefined => {
    if (typeof v !== 'object' || v === null) return undefined;
    const map: Record<string, string | null> = {};
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string') map[key] = val;
        else if (val === null) map[key] = null;
    }
    return Object.keys(map).length > 0 ? map : undefined;
});

// ============================================================================
// Pi Agent Event (stdin JSONL → event)
// ============================================================================

/** Minimal shape: must be an object with a string `type` field. */
export const PiAgentEventSchema = z.object({
    type: z.string(),
}).passthrough();

// ============================================================================
// Pi Response Event (stdout response)
// ============================================================================

export const PiResponseEventSchema = z.object({
    type: z.literal('response'),
    command: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    data: z.unknown().optional(),
    // RPC correlation id (sent by PiRpcResolver as string)
    id: z.string().optional(),
});

// ============================================================================
// Pi Command Summary
// ============================================================================

const VALID_COMMAND_SOURCES = ['extension', 'prompt', 'skill'] as const;
type PiCommandSource = (typeof VALID_COMMAND_SOURCES)[number];

const PiCommandSummarySchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    source: z.enum(VALID_COMMAND_SOURCES),
});

/** Tolerant command entry schema: invalid fields are normalized; empty names are dropped. */
const PiCommandEntrySchema = z.object({
    name: asStrOrDef(''),
    description: asOptStr,
    source: z.unknown().optional().transform(v =>
        VALID_COMMAND_SOURCES.includes(v as PiCommandSource)
            ? (v as PiCommandSource)
            : ('skill' as const),
    ),
}).passthrough().transform((c) => {
    if (!c.name) return null;
    const entry: { name: string; description?: string; source: PiCommandSource } = {
        name: c.name,
        source: c.source,
    };
    if (c.description !== undefined) entry.description = c.description;
    return entry;
});

const PiCommandsResponseDataSchema = z.object({
    commands: z.array(z.unknown()).default([]),
}).transform(data =>
    data.commands
        .map(c => PiCommandEntrySchema.safeParse(c))
        .filter((r): r is { success: true; data: NonNullable<typeof r.data> } => r.success && r.data !== null)
        .map(r => r.data),
);

// ============================================================================
// Pi Model Summary
// ============================================================================

/** Tolerant model entry schema: invalid fields are dropped; empty ids are dropped. */
const PiModelEntrySchema = z.object({
    id: asStrOrDef(''),
    provider: asStrOrDef('unknown'),
    name: asOptStr,
    contextWindow: asOptNum,
    reasoning: asOptBool,
    thinkingLevelMap: asOptThinkingLevelMap,
}).passthrough().transform((m): PiModelSummary | null => {
    if (!m.id) return null;
    const entry: PiModelSummary = { provider: m.provider, modelId: m.id };
    if (m.name !== undefined) entry.name = m.name;
    if (m.contextWindow !== undefined) entry.contextWindow = m.contextWindow;
    if (m.reasoning !== undefined) entry.reasoning = m.reasoning;
    if (m.thinkingLevelMap !== undefined) entry.thinkingLevelMap = m.thinkingLevelMap;
    return entry;
});

const PiModelsResponseDataSchema = z.object({
    models: z.array(z.unknown()).default([]),
}).transform(data =>
    data.models
        .map(m => PiModelEntrySchema.safeParse(m))
        .filter((r): r is { success: true; data: NonNullable<typeof r.data> } => r.success && r.data !== null)
        .map(r => r.data),
);

// ============================================================================
// Pi State (get_state response data)
// ============================================================================

export const PiStateDataSchema = z.object({
    model: z.object({
        id: z.string().optional(),
        modelId: z.string().optional(),
        provider: z.string().optional(),
    }).passthrough().optional(),
    sessionId: z.string().optional(),
    thinkingLevel: z.string().optional(),
    steeringMode: z.enum(['all', 'one-at-a-time']).optional(),
}).passthrough();

// ============================================================================
// Pi set_model response data
// ============================================================================

export const PiSetModelDataSchema = z.object({
    id: z.string().optional(),
    modelId: z.string().optional(),
    provider: z.string().optional(),
}).passthrough();

// ============================================================================
// SetSessionConfig RPC payload
// ============================================================================

export const SetSessionConfigPayloadSchema = z.object({
    permissionMode: z.unknown().optional(),
    model: z.union([
        z.string(),
        z.object({ provider: z.string(), modelId: z.string() }),
        z.null(),
    ]).optional(),
    effort: z.unknown().optional(),
}).passthrough();

// ============================================================================
// Pi thinking level — enum sourced from @hapi/protocol (single definition)
// ============================================================================

export const PiThinkingLevelSchema = z.enum(PI_THINKING_LEVELS);

// ============================================================================
// message_update assistant message event — delta extraction
// ============================================================================

export const PiAssistantMessageEventSchema = z.object({
    type: z.string(),
    delta: z.string().optional(),
    contentIndex: z.number().optional(),
}).passthrough();

// ============================================================================
// Parse helpers — replace hand-written type guards in loop.ts
// ============================================================================

export function parsePiCommands(data: unknown) {
    const result = PiCommandsResponseDataSchema.safeParse(data)
    return result.success ? result.data : []
}

export function parsePiModels(data: unknown) {
    const result = PiModelsResponseDataSchema.safeParse(data)
    return result.success ? result.data : []
}
