import { memo, useEffect, useMemo, useRef } from 'react'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useTranslation } from '@/lib/use-translation'

interface AutocompleteProps {
    suggestions: readonly Suggestion[]
    selectedIndex: number
    onSelect: (index: number) => void
}

function SourceBadge({ source, isSelected }: { source?: string; isSelected: boolean }) {
    if (!source || source === 'builtin') return null
    const label = source === 'user' || source === 'project' ? 'custom' : source
    return (
        <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${
            isSelected
                ? 'bg-white/20 text-inherit'
                : 'bg-[var(--app-secondary-bg)] text-[var(--app-hint)]'
        }`}>
            {label}
        </span>
    )
}

/**
 * Autocomplete suggestions list component.
 * Groups slash-command suggestions by source (built-in vs custom).
 */
export const Autocomplete = memo(function Autocomplete(props: AutocompleteProps) {
    const { suggestions, selectedIndex, onSelect } = props
    const { t } = useTranslation()
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (selectedIndex < 0 || selectedIndex >= suggestions.length) return
        const listEl = listRef.current
        if (!listEl) return
        const selectedEl = listEl.querySelector<HTMLButtonElement>(
            `[data-suggestion-index="${selectedIndex}"]`
        )
        selectedEl?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex, suggestions])

    // Group slash-command suggestions by built-in vs custom.
    // Non-slash suggestions (e.g. @-mentions) pass through ungrouped.
    const groups = useMemo(() => {
        const isSlash = suggestions.length > 0 && suggestions[0].text.startsWith('/')
        if (!isSlash) return [{ label: null, items: suggestions }]

        const builtin: Suggestion[] = []
        const custom: Suggestion[] = []
        for (const s of suggestions) {
            if (s.source === 'builtin') builtin.push(s)
            else custom.push(s)
        }

        const result: { label: string | null; items: readonly Suggestion[] }[] = []
        if (builtin.length > 0) result.push({ label: t('composer.slashCommands.builtin'), items: builtin })
        if (custom.length > 0) result.push({ label: t('composer.slashCommands.custom'), items: custom })
        // If all items are one source, skip the header
        if (result.length === 1) return [{ label: null, items: suggestions }]
        return result
    }, [suggestions, t])

    if (suggestions.length === 0) {
        return null
    }

    // Build a flat index for each item so keyboard selection works across groups
    let flatIndex = 0

    return (
        <div className="py-1" ref={listRef}>
            {groups.map((group) => {
                const groupItems = group.items.map((suggestion) => {
                    const idx = flatIndex++
                    return (
                        <button
                            key={suggestion.key}
                            type="button"
                            data-suggestion-index={idx}
                            className={`flex min-h-[44px] w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                                idx === selectedIndex
                                    ? 'bg-[var(--app-button)] text-[var(--app-button-text)]'
                                    : 'text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]'
                            }`}
                            onClick={() => onSelect(idx)}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{suggestion.label}</span>
                                    <SourceBadge source={suggestion.source} isSelected={idx === selectedIndex} />
                                </div>
                                {suggestion.description && (
                                    <span className={`text-xs leading-snug line-clamp-2 ${
                                        idx === selectedIndex
                                            ? 'opacity-80'
                                            : 'text-[var(--app-hint)]'
                                    }`}>
                                        {suggestion.description}
                                    </span>
                                )}
                            </div>
                        </button>
                    )
                })

                if (!group.label) return groupItems

                return (
                    <div key={group.label}>
                        <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--app-hint)]">
                            {group.label}
                        </div>
                        {groupItems}
                    </div>
                )
            })}
        </div>
    )
})
