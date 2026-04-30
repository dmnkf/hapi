import { describe, expect, test } from 'bun:test'
import {
    CLAUDE_MODEL_PRESETS,
    CLAUDE_MODEL_LABELS,
    CODEX_MODEL_LABELS,
    CODEX_MODEL_PRESETS,
    DEFAULT_GEMINI_MODEL,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_PRESETS,
    getClaudeModelDisplayLabel,
    getClaudeModelLabel,
    getModelDisplayLabel,
    isClaudeModelPreset,
} from './models'

describe('isClaudeModelPreset', () => {
    test('accepts valid presets', () => {
        for (const preset of CLAUDE_MODEL_PRESETS) {
            expect(isClaudeModelPreset(preset)).toBe(true)
        }
    })

    test('rejects unknown model string', () => {
        expect(isClaudeModelPreset('haiku')).toBe(false)
    })

    test('rejects null and undefined', () => {
        expect(isClaudeModelPreset(null)).toBe(false)
        expect(isClaudeModelPreset(undefined)).toBe(false)
    })
})

describe('getClaudeModelLabel', () => {
    test('returns label for known presets', () => {
        expect(getClaudeModelLabel('sonnet')).toBe('Sonnet')
        expect(getClaudeModelLabel('opus')).toBe('Opus')
        expect(getClaudeModelLabel('opus[1m]')).toBe('Opus 1M')
    })

    test('trims whitespace before lookup', () => {
        expect(getClaudeModelLabel('  sonnet  ')).toBe('Sonnet')
    })

    test('returns null for unknown model', () => {
        expect(getClaudeModelLabel('haiku')).toBeNull()
    })

    test('returns null for empty/whitespace-only string', () => {
        expect(getClaudeModelLabel('')).toBeNull()
        expect(getClaudeModelLabel('   ')).toBeNull()
    })
})

describe('model display labels', () => {
    test('can include the exact Claude Code alias in picker labels', () => {
        expect(getClaudeModelDisplayLabel('opus[1m]', { includeValue: true })).toBe('Opus 1M (opus[1m])')
        expect(getClaudeModelDisplayLabel('sonnet', { includeValue: true })).toBe('Sonnet (sonnet)')
    })

    test('keeps compact Claude labels when value inclusion is not requested', () => {
        expect(getClaudeModelDisplayLabel('opus[1m]')).toBe('Opus 1M')
    })

    test('falls back to the literal model id for unknown Claude models', () => {
        expect(getClaudeModelDisplayLabel('claude-opus-4-1-20250805', { includeValue: true })).toBe('claude-opus-4-1-20250805')
    })

    test('formats runtime model labels without hiding the CLI-facing id', () => {
        expect(getModelDisplayLabel('gpt-5.5', 'GPT-5.5')).toBe('GPT-5.5 (gpt-5.5)')
        expect(getModelDisplayLabel('gpt-5.5', 'gpt-5.5')).toBe('gpt-5.5')
        expect(getModelDisplayLabel('gpt-5.5')).toBe('gpt-5.5')
    })
})

describe('model constants consistency', () => {
    test('every CLAUDE_MODEL_PRESET has a label', () => {
        for (const preset of CLAUDE_MODEL_PRESETS) {
            expect(CLAUDE_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('every GEMINI_MODEL_PRESET has a label', () => {
        for (const preset of GEMINI_MODEL_PRESETS) {
            expect(GEMINI_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('Codex presets include current runtime picker models', () => {
        expect(CODEX_MODEL_PRESETS).toContain('gpt-5.5')
        expect(CODEX_MODEL_PRESETS).toContain('gpt-5.3-codex-spark')
    })

    test('every CODEX_MODEL_PRESET has a label', () => {
        for (const preset of CODEX_MODEL_PRESETS) {
            expect(CODEX_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('DEFAULT_GEMINI_MODEL is a valid preset', () => {
        expect(GEMINI_MODEL_PRESETS).toContain(DEFAULT_GEMINI_MODEL)
    })
})
