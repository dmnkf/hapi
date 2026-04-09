import { useCallback, useMemo, useState } from 'react'
import type { AgentType } from './types'

const STORAGE_KEY = 'hapi:quickStartConfigs'
const MAX_CONFIGS = 3

export interface QuickStartConfig {
    machineId: string
    machineName: string
    directory: string
    agent: AgentType
    model: string
    timestamp: number
}

function loadConfigs(): QuickStartConfig[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return []
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed)) return []
        return parsed.slice(0, MAX_CONFIGS)
    } catch {
        return []
    }
}

function saveConfigs(configs: QuickStartConfig[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs.slice(0, MAX_CONFIGS)))
    } catch {
        // Ignore storage errors
    }
}

export function useQuickStartConfigs() {
    const [configs, setConfigs] = useState<QuickStartConfig[]>(loadConfigs)

    const addConfig = useCallback((config: Omit<QuickStartConfig, 'timestamp'>) => {
        setConfigs((prev) => {
            // Deduplicate by machineId + directory + agent
            const filtered = prev.filter(
                (c) => !(c.machineId === config.machineId && c.directory === config.directory && c.agent === config.agent)
            )
            const updated = [{ ...config, timestamp: Date.now() }, ...filtered].slice(0, MAX_CONFIGS)
            saveConfigs(updated)
            return updated
        })
    }, [])

    return useMemo(() => ({ configs, addConfig }), [configs, addConfig])
}
