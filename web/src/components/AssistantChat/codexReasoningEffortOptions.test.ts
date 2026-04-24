import { describe, expect, it } from 'vitest'
import { getCodexComposerReasoningEffortOptions } from './codexReasoningEffortOptions'

describe('getCodexComposerReasoningEffortOptions', () => {
    it('includes the default option and all shared preset values', () => {
        expect(getCodexComposerReasoningEffortOptions(null)).toEqual([
            { value: null, label: 'Default' },
            { value: 'none', label: 'None' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'XHigh' }
        ])
    })

    it('preserves non-preset current values alongside shared presets', () => {
        expect(getCodexComposerReasoningEffortOptions('custom-effort')).toEqual([
            { value: null, label: 'Default' },
            { value: 'custom-effort', label: 'Custom-effort' },
            { value: 'none', label: 'None' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'XHigh' }
        ])
    })

    it('prefers runtime-supplied reasoning efforts when capabilities are present', () => {
        expect(getCodexComposerReasoningEffortOptions(null, { reasoningEfforts: ['low', 'high'] })).toEqual([
            { value: null, label: 'Default' },
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' }
        ])
    })
})
