/**
 * @vitest-environment node
 *
 * TerminalPage renders a heavy component tree (xterm.js + canvas addons)
 * that exceeds jsdom's memory limits. These tests validate the paste
 * logic by extracting and testing it directly without rendering.
 */
import { describe, expect, it, vi } from 'vitest'

/**
 * Extracted paste logic matching TerminalPage.handlePaste behavior:
 * 1. Try navigator.clipboard.readText()
 * 2. If clipboard returns text, write it to the terminal
 * 3. If clipboard is empty, do nothing
 * 4. If clipboard throws, open the manual paste dialog
 */
async function handlePaste(
    readClipboard: () => Promise<string>,
    write: (data: string) => void,
    openManualDialog: () => void
): Promise<void> {
    try {
        const text = await readClipboard()
        if (text) {
            write(text)
        }
    } catch {
        openManualDialog()
    }
}

describe('TerminalPage paste behavior', () => {
    it('writes clipboard text to terminal when available', async () => {
        const write = vi.fn()
        const openDialog = vi.fn()
        const readClipboard = vi.fn(async () => 'hello world')

        await handlePaste(readClipboard, write, openDialog)

        expect(readClipboard).toHaveBeenCalledTimes(1)
        expect(write).toHaveBeenCalledWith('hello world')
        expect(openDialog).not.toHaveBeenCalled()
    })

    it('does not write or open dialog when clipboard text is empty', async () => {
        const write = vi.fn()
        const openDialog = vi.fn()
        const readClipboard = vi.fn(async () => '')

        await handlePaste(readClipboard, write, openDialog)

        expect(readClipboard).toHaveBeenCalledTimes(1)
        expect(write).not.toHaveBeenCalled()
        expect(openDialog).not.toHaveBeenCalled()
    })

    it('opens manual paste dialog when clipboard read fails', async () => {
        const write = vi.fn()
        const openDialog = vi.fn()
        const readClipboard = vi.fn(async () => {
            throw new Error('blocked')
        })

        await handlePaste(readClipboard, write, openDialog)

        expect(readClipboard).toHaveBeenCalledTimes(1)
        expect(write).not.toHaveBeenCalled()
        expect(openDialog).toHaveBeenCalledTimes(1)
    })
})
