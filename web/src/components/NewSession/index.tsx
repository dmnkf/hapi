import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ApiClient } from '@/api/client'
import type { DirectoryEntry, Machine } from '@/types/api'
import { usePlatform } from '@/hooks/usePlatform'
import { useMachinePathsExists } from '@/hooks/useMachinePathsExists'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useActiveSuggestions, type Suggestion } from '@/hooks/useActiveSuggestions'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import { useTranslation } from '@/lib/use-translation'
import type { AgentType, ClaudeEffort, CodexReasoningEffort, SessionType } from './types'
import { ActionButtons } from './ActionButtons'
import { AgentSelector } from './AgentSelector'
import { DirectorySection } from './DirectorySection'
import { MachineSelector } from './MachineSelector'
import { ModelSelector } from './ModelSelector'
import { ClaudeEffortSelector } from './ClaudeEffortSelector'
import { ReasoningEffortSelector } from './ReasoningEffortSelector'
import {
    loadPreferredAgent,
    loadPreferredYoloMode,
    savePreferredAgent,
    savePreferredYoloMode,
} from './preferences'
import { SessionTypeSelector } from './SessionTypeSelector'
import { YoloToggle } from './YoloToggle'
import { QuickStartCards } from './QuickStartCards'
import { useQuickStartConfigs, type QuickStartConfig } from './useQuickStartConfigs'
import { formatRunnerSpawnError } from '../../utils/formatRunnerSpawnError'

const ADVANCED_STORAGE_KEY = 'hapi:newSession:showAdvanced'

function loadShowAdvanced(): boolean {
    try {
        return localStorage.getItem(ADVANCED_STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

function getDefaultBrowsePath(machine: Machine | null): string {
    return machine?.metadata?.platform === 'win32' ? 'C:\\' : '/'
}

function getPathSeparator(machine: Machine | null, path: string): '/' | '\\' {
    if (path.includes('\\')) return '\\'
    if (machine?.metadata?.platform === 'win32') return '\\'
    return '/'
}

function getDirectoryLookupTarget(
    query: string,
    machine: Machine | null
): { directoryPath: string; fragment: string; separator: '/' | '\\' } | null {
    const trimmed = query.trim()

    if (!trimmed) {
        const directoryPath = getDefaultBrowsePath(machine)
        return {
            directoryPath,
            fragment: '',
            separator: getPathSeparator(machine, directoryPath)
        }
    }

    if (/^[A-Za-z]:$/.test(trimmed)) {
        const directoryPath = `${trimmed}\\`
        return {
            directoryPath,
            fragment: '',
            separator: '\\'
        }
    }

    if (trimmed.endsWith('/') || trimmed.endsWith('\\')) {
        return {
            directoryPath: trimmed,
            fragment: '',
            separator: getPathSeparator(machine, trimmed)
        }
    }

    const lastSeparator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
    if (lastSeparator < 0) {
        return null
    }

    const directoryPath = trimmed.slice(0, lastSeparator + 1)
    return {
        directoryPath,
        fragment: trimmed.slice(lastSeparator + 1),
        separator: getPathSeparator(machine, directoryPath)
    }
}

function joinDirectoryPath(directoryPath: string, name: string, separator: '/' | '\\'): string {
    if (directoryPath === separator) {
        return `${directoryPath}${name}`
    }

    if (directoryPath.endsWith('/') || directoryPath.endsWith('\\')) {
        return `${directoryPath}${name}`
    }

    return `${directoryPath}${separator}${name}`
}

export function NewSession(props: {
    api: ApiClient
    machines: Machine[]
    isLoading?: boolean
    onSuccess: (sessionId: string) => void
    onCancel: () => void
}) {
    const { haptic } = usePlatform()
    const { t } = useTranslation()
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { sessions } = useSessions(props.api)
    const isFormDisabled = Boolean(isPending || props.isLoading)
    const { getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId } = useRecentPaths()
    const { configs: quickStartConfigs, addConfig: addQuickStartConfig } = useQuickStartConfigs()

    const [machineId, setMachineId] = useState<string | null>(null)
    const [directory, setDirectory] = useState('')
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)
    const [isDirectoryFocused, setIsDirectoryFocused] = useState(false)
    const [agent, setAgent] = useState<AgentType>(loadPreferredAgent)
    const [model, setModel] = useState('auto')
    const [effort, setEffort] = useState<ClaudeEffort>('auto')
    const [modelReasoningEffort, setModelReasoningEffort] = useState<CodexReasoningEffort>('default')
    const [yoloMode, setYoloMode] = useState(loadPreferredYoloMode)
    const [sessionType, setSessionType] = useState<SessionType>('simple')
    const [worktreeName, setWorktreeName] = useState('')
    const [directoryCreationConfirmed, setDirectoryCreationConfirmed] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(loadShowAdvanced)
    const worktreeInputRef = useRef<HTMLInputElement>(null)
    const machineDirectoryCacheRef = useRef(new Map<string, DirectoryEntry[]>())

    // Smart default: single machine auto-select
    const isSingleMachine = props.machines.length === 1

    useEffect(() => {
        if (sessionType === 'worktree') {
            worktreeInputRef.current?.focus()
        }
    }, [sessionType])

    useEffect(() => {
        setModel('auto')
        setEffort('auto')
    }, [agent])

    useEffect(() => {
        savePreferredAgent(agent)
    }, [agent])

    useEffect(() => {
        savePreferredYoloMode(yoloMode)
    }, [yoloMode])

    useEffect(() => {
        if (props.machines.length === 0) return
        if (machineId && props.machines.find((m) => m.id === machineId)) return

        const lastUsed = getLastUsedMachineId()
        const foundLast = lastUsed ? props.machines.find((m) => m.id === lastUsed) : null

        if (foundLast) {
            setMachineId(foundLast.id)
            const paths = getRecentPaths(foundLast.id)
            if (paths[0]) setDirectory(paths[0])
        } else if (props.machines[0]) {
            setMachineId(props.machines[0].id)
        }
    }, [props.machines, machineId, getLastUsedMachineId, getRecentPaths])

    const selectedMachine = useMemo(
        () => (machineId ? props.machines.find((machine) => machine.id === machineId) ?? null : null),
        [machineId, props.machines]
    )
    const runnerSpawnError = useMemo(
        () => formatRunnerSpawnError(selectedMachine),
        [selectedMachine]
    )

    const recentPaths = useMemo(
        () => getRecentPaths(machineId),
        [getRecentPaths, machineId]
    )

    const trimmedDirectory = directory.trim()
    const deferredDirectory = useDeferredValue(trimmedDirectory)
    const allPaths = useDirectorySuggestions(machineId, sessions, recentPaths)

    const pathsToCheck = useMemo(
        () => Array.from(new Set([
            ...(deferredDirectory ? [deferredDirectory] : []),
            ...allPaths
        ])).slice(0, 1000),
        [allPaths, deferredDirectory]
    )

    const { pathExistence, checkPathsExists } = useMachinePathsExists(props.api, machineId, pathsToCheck)

    const verifiedPaths = useMemo(
        () => allPaths.filter((path) => pathExistence[path]),
        [allPaths, pathExistence]
    )

    const currentDirectoryExists = trimmedDirectory ? pathExistence[trimmedDirectory] : undefined
    const needsDirectoryCreationWarning = sessionType === 'simple' && trimmedDirectory !== '' && currentDirectoryExists === false
    const missingWorktreeDirectory = sessionType === 'worktree' && trimmedDirectory !== '' && currentDirectoryExists === false
    const directoryStatusMessage = missingWorktreeDirectory
        ? t('session.directoryMissingWorktree')
        : needsDirectoryCreationWarning
            ? (
                directoryCreationConfirmed
                    ? t('session.directoryMissingSimpleConfirm')
                    : t('session.directoryMissingSimple')
            )
            : null
    const directoryStatusTone = missingWorktreeDirectory ? 'error' : needsDirectoryCreationWarning ? 'warning' : null
    const createLabel = needsDirectoryCreationWarning && directoryCreationConfirmed
        ? t('session.createAndCreateDirectory')
        : undefined

    useEffect(() => {
        setDirectoryCreationConfirmed(false)
    }, [machineId, sessionType, trimmedDirectory])

    useEffect(() => {
        machineDirectoryCacheRef.current.clear()
    }, [machineId])

    const getSuggestions = useCallback(async (query: string): Promise<Suggestion[]> => {
        const lowered = query.toLowerCase()
        const localSuggestions = verifiedPaths
            .filter((path) => path.toLowerCase().includes(lowered))
            .slice(0, 8)
            .map((path) => ({
                key: path,
                text: path,
                label: path
            }))

        if (!machineId) {
            return localSuggestions
        }

        const lookupTarget = getDirectoryLookupTarget(query, selectedMachine)
        if (!lookupTarget) {
            return localSuggestions
        }

        const cacheKey = `${machineId}:${lookupTarget.directoryPath}`
        let entries = machineDirectoryCacheRef.current.get(cacheKey)

        if (!entries) {
            const response = await props.api.listMachineDirectory(machineId, lookupTarget.directoryPath)
            if (!response.success) {
                return localSuggestions
            }

            entries = (response.entries ?? []).filter((entry) => entry.type === 'directory')
            machineDirectoryCacheRef.current.set(cacheKey, entries)
        }

        const remoteSuggestions = entries
            .filter((entry) => lookupTarget.fragment === '' || entry.name.toLowerCase().includes(lookupTarget.fragment.toLowerCase()))
            .slice(0, 12)
            .map((entry) => {
                const fullPath = joinDirectoryPath(lookupTarget.directoryPath, entry.name, lookupTarget.separator)
                const browsablePath = `${fullPath}${lookupTarget.separator}`
                return {
                    key: `machine-directory:${browsablePath}`,
                    text: browsablePath,
                    label: browsablePath,
                    description: selectedMachine ? getMachineTitle(selectedMachine) : undefined
                }
            })

        const mergedSuggestions = new Map<string, Suggestion>()
        for (const suggestion of localSuggestions) {
            mergedSuggestions.set(suggestion.text, suggestion)
        }
        for (const suggestion of remoteSuggestions) {
            mergedSuggestions.set(suggestion.text, suggestion)
        }

        return Array.from(mergedSuggestions.values()).slice(0, 12)
    }, [verifiedPaths, machineId, selectedMachine, props.api])

    const activeQuery = (!isDirectoryFocused || suppressSuggestions) ? null : directory

    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeQuery,
        getSuggestions,
        { allowEmptyQuery: true, autoSelectFirst: false }
    )

    const handleMachineChange = useCallback((newMachineId: string) => {
        setMachineId(newMachineId)
        const paths = getRecentPaths(newMachineId)
        if (paths[0]) {
            setDirectory(paths[0])
        } else {
            setDirectory('')
        }
    }, [getRecentPaths])

    const handlePathClick = useCallback((path: string) => {
        setDirectory(path)
    }, [])

    const handleSuggestionSelect = useCallback((index: number) => {
        const suggestion = suggestions[index]
        if (suggestion) {
            setDirectory(suggestion.text)
            clearSuggestions()
            setSuppressSuggestions(true)
        }
    }, [suggestions, clearSuggestions])

    const handleDirectoryChange = useCallback((value: string) => {
        setSuppressSuggestions(false)
        setDirectory(value)
    }, [])

    const handleDirectoryFocus = useCallback(() => {
        setSuppressSuggestions(false)
        setIsDirectoryFocused(true)
    }, [])

    const handleDirectoryBlur = useCallback(() => {
        setIsDirectoryFocused(false)
    }, [])

    const handleDirectoryKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (suggestions.length === 0) return

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveUp()
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveDown()
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
            if (selectedIndex >= 0) {
                event.preventDefault()
                handleSuggestionSelect(selectedIndex)
            }
        }

        if (event.key === 'Escape') {
            clearSuggestions()
        }
    }, [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions, handleSuggestionSelect])

    const handleToggleAdvanced = useCallback(() => {
        setShowAdvanced((prev) => {
            const next = !prev
            try { localStorage.setItem(ADVANCED_STORAGE_KEY, next ? 'true' : 'false') } catch { /* ignore */ }
            return next
        })
    }, [])

    async function handleCreate() {
        if (!machineId || !trimmedDirectory) return

        setError(null)
        try {
            const existsResult = await checkPathsExists([trimmedDirectory])
            const directoryExists = existsResult[trimmedDirectory]

            if (sessionType === 'worktree' && directoryExists === false) {
                haptic.notification('error')
                setError(t('session.directoryMissingWorktree'))
                return
            }

            if (sessionType === 'simple' && directoryExists === false && !directoryCreationConfirmed) {
                setDirectoryCreationConfirmed(true)
                return
            }

            const resolvedModel = model !== 'auto' && agent !== 'opencode' ? model : undefined
            const resolvedEffort = agent === 'claude' && effort !== 'auto' ? effort : undefined
            const resolvedModelReasoningEffort = agent === 'codex' && modelReasoningEffort !== 'default'
                ? modelReasoningEffort
                : undefined
            const result = await spawnSession({
                machineId,
                directory: trimmedDirectory,
                agent,
                model: resolvedModel,
                effort: resolvedEffort,
                modelReasoningEffort: resolvedModelReasoningEffort,
                yolo: yoloMode,
                sessionType,
                worktreeName: sessionType === 'worktree' ? (worktreeName.trim() || undefined) : undefined
            })

            if (result.type === 'success') {
                haptic.notification('success')
                setLastUsedMachineId(machineId)
                addRecentPath(machineId, trimmedDirectory)
                // Save quick-start config
                const machineName = selectedMachine ? getMachineTitle(selectedMachine) : machineId
                addQuickStartConfig({
                    machineId,
                    machineName,
                    directory: trimmedDirectory,
                    agent,
                    model,
                })
                props.onSuccess(result.sessionId)
                return
            }

            haptic.notification('error')
            setError(result.message)
        } catch (e) {
            haptic.notification('error')
            setError(e instanceof Error ? e.message : 'Failed to create session')
        }
    }

    const [quickStartPending, setQuickStartPending] = useState(false)

    const handleQuickStartSelect = useCallback((config: QuickStartConfig) => {
        setMachineId(config.machineId)
        setDirectory(config.directory)
        setAgent(config.agent)
        setModel(config.model)
        setQuickStartPending(true)
    }, [])

    useEffect(() => {
        if (!quickStartPending) return
        if (!machineId || !directory.trim()) return
        setQuickStartPending(false)
        handleCreate()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quickStartPending, machineId, directory])

    const connectedMachineIds = useMemo(
        () => new Set(props.machines.map((m) => m.id)),
        [props.machines]
    )

    const canCreate = Boolean(machineId && trimmedDirectory && !isFormDisabled && !missingWorktreeDirectory)

    return (
        <div className="flex flex-col divide-y divide-[var(--app-divider)]">
            {/* Quick-start cards */}
            <QuickStartCards
                configs={quickStartConfigs}
                isDisabled={isFormDisabled}
                connectedMachineIds={connectedMachineIds}
                onSelect={handleQuickStartSelect}
            />

            {/* Machine selector: show as chip if single machine, full dropdown otherwise */}
            {isSingleMachine && selectedMachine ? (
                <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs text-[var(--app-hint)]">{t('newSession.machine')}:</span>
                    <span className="rounded bg-[var(--app-subtle-bg)] px-2 py-0.5 text-xs text-[var(--app-fg)]">
                        {getMachineTitle(selectedMachine)}
                        {selectedMachine.metadata?.platform ? ` (${selectedMachine.metadata.platform})` : ''}
                    </span>
                </div>
            ) : (
                <MachineSelector
                    machines={props.machines}
                    machineId={machineId}
                    isLoading={props.isLoading}
                    isDisabled={isFormDisabled}
                    onChange={handleMachineChange}
                />
            )}
            {runnerSpawnError ? (
                <div className="px-3 py-2 text-xs text-red-600">
                    Runner last spawn error: {runnerSpawnError}
                </div>
            ) : null}

            {/* Directory - always visible */}
            <DirectorySection
                directory={directory}
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                isDisabled={isFormDisabled}
                recentPaths={recentPaths}
                statusMessage={directoryStatusMessage}
                statusTone={directoryStatusTone}
                onDirectoryChange={handleDirectoryChange}
                onDirectoryFocus={handleDirectoryFocus}
                onDirectoryBlur={handleDirectoryBlur}
                onDirectoryKeyDown={handleDirectoryKeyDown}
                onSuggestionSelect={handleSuggestionSelect}
                onPathClick={handlePathClick}
            />

            {/* Agent - always visible */}
            <AgentSelector
                agent={agent}
                isDisabled={isFormDisabled}
                onAgentChange={setAgent}
            />

            {/* Advanced options toggle */}
            <button
                type="button"
                onClick={handleToggleAdvanced}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-[var(--app-link)] hover:text-[var(--app-link-hover)] transition-colors"
            >
                <svg
                    className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {t('newSession.advancedOptions')}
            </button>

            {/* Advanced options section */}
            {showAdvanced && (
                <>
                    <ModelSelector
                        agent={agent}
                        model={model}
                        isDisabled={isFormDisabled}
                        onModelChange={setModel}
                    />
                    <ClaudeEffortSelector
                        agent={agent}
                        effort={effort}
                        isDisabled={isFormDisabled}
                        onEffortChange={setEffort}
                    />
                    <ReasoningEffortSelector
                        agent={agent}
                        value={modelReasoningEffort}
                        isDisabled={isFormDisabled}
                        onChange={setModelReasoningEffort}
                    />
                    <YoloToggle
                        yoloMode={yoloMode}
                        isDisabled={isFormDisabled}
                        onToggle={setYoloMode}
                    />
                    <SessionTypeSelector
                        sessionType={sessionType}
                        worktreeName={worktreeName}
                        worktreeInputRef={worktreeInputRef}
                        isDisabled={isFormDisabled}
                        onSessionTypeChange={setSessionType}
                        onWorktreeNameChange={setWorktreeName}
                    />
                </>
            )}

            {(error ?? spawnError) ? (
                <div className="px-3 py-2 text-sm text-red-600">
                    {error ?? spawnError}
                </div>
            ) : null}

            <ActionButtons
                isPending={isPending}
                canCreate={canCreate}
                isDisabled={isFormDisabled}
                createLabel={createLabel}
                onCancel={props.onCancel}
                onCreate={handleCreate}
            />
        </div>
    )
}
