import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { NewSession } from './index'
import type { Machine, SessionSummary } from '@/types/api'

const sessionsMock = vi.hoisted(() => vi.fn<() => { sessions: SessionSummary[] }>())
const spawnSessionMock = vi.hoisted(() => vi.fn())
const hapticNotificationMock = vi.hoisted(() => vi.fn())
const machinePathsExistsMock = vi.hoisted(() => vi.fn())
const recentPathsState = vi.hoisted(() => ({
    paths: [] as string[],
    lastUsedMachineId: null as string | null,
}))
const apiListMachineDirectoryMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: () => sessionsMock(),
}))

vi.mock('@/hooks/mutations/useSpawnSession', () => ({
    useSpawnSession: () => ({
        spawnSession: spawnSessionMock,
        isPending: false,
        error: null,
    }),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: { notification: hapticNotificationMock },
    }),
}))

vi.mock('@/hooks/useMachinePathsExists', () => ({
    useMachinePathsExists: (...args: unknown[]) => machinePathsExistsMock(...args),
}))

vi.mock('./preferences', () => ({
    loadPreferredAgent: () => 'claude',
    loadPreferredYoloMode: () => false,
    savePreferredAgent: vi.fn(),
    savePreferredYoloMode: vi.fn(),
}))

vi.mock('./useQuickStartConfigs', () => ({
    useQuickStartConfigs: () => ({
        configs: [],
        addConfig: vi.fn(),
    }),
}))

vi.mock('@/hooks/useRecentPaths', () => ({
    useRecentPaths: () => ({
        getRecentPaths: vi.fn(() => recentPathsState.paths),
        addRecentPath: vi.fn(),
        getLastUsedMachineId: vi.fn(() => recentPathsState.lastUsedMachineId),
        setLastUsedMachineId: vi.fn(),
    }),
}))

function createMachine(overrides?: Partial<Machine>): Machine {
    return {
        id: 'machine-1',
        active: true,
        metadata: {
            host: 'macbook',
            platform: 'darwin',
            happyCliVersion: '1.0.0',
            displayName: 'MacBook Pro',
        },
        runnerState: null,
        ...overrides,
    }
}

function renderNewSession(machine: Machine = createMachine()) {
    return render(
        <I18nProvider>
            <NewSession
                api={{ listMachineDirectory: apiListMachineDirectoryMock } as never}
                machines={[machine]}
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        </I18nProvider>
    )
}

describe('NewSession machine directory suggestions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        recentPathsState.paths = []
        recentPathsState.lastUsedMachineId = null
        sessionsMock.mockReturnValue({ sessions: [] })
        machinePathsExistsMock.mockReturnValue({
            pathExistence: {},
            checkPathsExists: vi.fn().mockResolvedValue({}),
        })
        spawnSessionMock.mockResolvedValue({ type: 'success', sessionId: 'session-1' })
        apiListMachineDirectoryMock.mockResolvedValue({
            success: true,
            entries: [
                { name: 'projects', type: 'directory' },
                { name: 'Desktop', type: 'directory' },
                { name: 'notes.txt', type: 'file' },
            ],
        })
    })

    it('loads root machine directories when the field is focused empty', async () => {
        const { getByPlaceholderText, findByText } = renderNewSession()
        const input = getByPlaceholderText('/path/to/project') as HTMLInputElement

        fireEvent.focus(input)

        await findByText('/projects/')
        expect(apiListMachineDirectoryMock).toHaveBeenCalledWith('machine-1', '/')
    })

    it('loads nested machine directories for partially typed absolute paths', async () => {
        const { getByPlaceholderText, findByText } = renderNewSession()
        const input = getByPlaceholderText('/path/to/project') as HTMLInputElement

        fireEvent.focus(input)
        await waitFor(() => {
            expect(apiListMachineDirectoryMock).toHaveBeenCalledWith('machine-1', '/')
        })

        apiListMachineDirectoryMock.mockClear()
        fireEvent.change(input, { target: { value: '/Users/dmnk/pro' } })

        await waitFor(() => {
            expect(input.value).toBe('/Users/dmnk/pro')
            expect(apiListMachineDirectoryMock).toHaveBeenCalledWith('machine-1', '/Users/dmnk/')
        })

        await findByText('/Users/dmnk/projects/')
    })

    it('uses Windows root browsing for win32 machines', async () => {
        const windowsMachine = createMachine({
            metadata: {
                host: 'windows-box',
                platform: 'win32',
                happyCliVersion: '1.0.0',
                displayName: 'Windows Box',
            },
        })
        const { getByPlaceholderText, findByText } = renderNewSession(windowsMachine)
        const input = getByPlaceholderText('/path/to/project') as HTMLInputElement

        fireEvent.focus(input)

        await findByText('C:\\projects\\')
        expect(apiListMachineDirectoryMock).toHaveBeenCalledWith('machine-1', 'C:\\')
    })
})
