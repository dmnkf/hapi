import { z } from 'zod'

// Dynamic per-session capabilities reported by a running runtime.
// The CLI probes its underlying agent (e.g. codex app-server's `model/list`)
// and emits this to the hub; the web renders selectors from it when present
// and falls back to shared static presets otherwise.

export const ModelCapabilitySchema = z.object({
    id: z.string(),
    label: z.string().optional(),
    reasoningEfforts: z.array(z.string()).optional(),
    isDefault: z.boolean().optional()
})

export const SessionCapabilitiesSchema = z.object({
    models: z.array(ModelCapabilitySchema).optional(),
    reasoningEfforts: z.array(z.string()).optional(),
    effortOptions: z.array(z.string()).optional(),
    collaborationModes: z.array(z.string()).optional(),
    source: z.enum(['dynamic', 'static']).optional(),
    probedAt: z.number().optional()
})

export const RuntimeSlashCommandSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    source: z.literal('runtime').optional().default('runtime'),
    content: z.string().optional(),
    pluginName: z.string().optional(),
    inputHint: z.string().optional()
})

export const SessionRuntimeSlashCommandsSchema = z.object({
    commands: z.array(RuntimeSlashCommandSchema),
    source: z.enum(['dynamic', 'static']).optional(),
    updatedAt: z.number().optional()
})

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>
export type SessionCapabilities = z.infer<typeof SessionCapabilitiesSchema>
export type RuntimeSlashCommand = z.infer<typeof RuntimeSlashCommandSchema>
export type SessionRuntimeSlashCommands = z.infer<typeof SessionRuntimeSlashCommandsSchema>
