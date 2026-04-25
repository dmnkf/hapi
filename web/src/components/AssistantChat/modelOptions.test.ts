import { describe, expect, it } from 'vitest'
import { getModelOptionsForFlavor, getNextModelForFlavor } from './modelOptions'

describe('getModelOptionsForFlavor', () => {
    it('returns Gemini model options for gemini flavor', () => {
        const options = getModelOptionsForFlavor('gemini')
        expect(options[0]).toEqual({ value: null, label: 'Default' })
        expect(options.some((o) => o.value === 'gemini-3-flash-preview')).toBe(true)
        expect(options.some((o) => o.value === 'gemini-2.5-flash')).toBe(true)
    })

    it('returns Claude model options for claude flavor', () => {
        const options = getModelOptionsForFlavor('claude')
        expect(options[0]).toEqual({ value: null, label: 'Auto' })
        expect(options.some((o) => o.value === 'sonnet')).toBe(true)
        expect(options.some((o) => o.value === 'opus')).toBe(true)
    })

    it('includes custom Gemini model from env/config in options', () => {
        const options = getModelOptionsForFlavor('gemini', 'gemini-custom-experiment')
        expect(options.some((o) => o.value === 'gemini-custom-experiment')).toBe(true)
    })

    it('does not duplicate a preset Gemini model', () => {
        const options = getModelOptionsForFlavor('gemini', 'gemini-2.5-flash')
        const flashCount = options.filter((o) => o.value === 'gemini-2.5-flash').length
        expect(flashCount).toBe(1)
    })

    it('prefers runtime Gemini model capabilities when present', () => {
        const options = getModelOptionsForFlavor('gemini', null, {
            models: [
                { id: 'runtime-fast', label: 'Runtime Fast' },
                { id: 'runtime-deep', label: 'Runtime Deep' }
            ],
            source: 'dynamic'
        })
        expect(options).toEqual([
            { value: null, label: 'Auto' },
            { value: 'runtime-fast', label: 'Runtime Fast' },
            { value: 'runtime-deep', label: 'Runtime Deep' }
        ])
    })

    it('uses runtime Codex model capabilities without a synthetic auto option', () => {
        const options = getModelOptionsForFlavor('codex', null, {
            models: [
                { id: 'gpt-runtime-fast', label: 'Runtime Fast' },
                { id: 'gpt-runtime-deep', label: 'Runtime Deep' }
            ],
            source: 'dynamic'
        })
        expect(options).toEqual([
            { value: 'gpt-runtime-fast', label: 'Runtime Fast' },
            { value: 'gpt-runtime-deep', label: 'Runtime Deep' }
        ])
    })

    it('does not return static Codex model options when runtime capabilities are absent', () => {
        expect(getModelOptionsForFlavor('codex')).toEqual([])
    })
})

describe('getNextModelForFlavor', () => {
    it('cycles Gemini models', () => {
        const next = getNextModelForFlavor('gemini', null)
        expect(next).not.toBeNull()
    })

    it('cycles Claude models', () => {
        const next = getNextModelForFlavor('claude', null)
        expect(next).not.toBeNull()
    })

    it('cycles runtime Codex models', () => {
        const next = getNextModelForFlavor('codex', null, {
            models: [
                { id: 'gpt-runtime-fast' },
                { id: 'gpt-runtime-deep' }
            ],
            source: 'dynamic'
        })
        expect(next).toBe('gpt-runtime-fast')
    })
})
