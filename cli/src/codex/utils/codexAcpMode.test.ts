import { describe, expect, it } from 'vitest';
import { codexAcpModeForPermissionMode } from './codexAcpMode';

describe('codexAcpModeForPermissionMode', () => {
    it('maps HAPI Codex permission modes onto codex-acp approval presets', () => {
        expect(codexAcpModeForPermissionMode('default')).toBe('suggest');
        expect(codexAcpModeForPermissionMode('read-only')).toBe('read-only');
        expect(codexAcpModeForPermissionMode('safe-yolo')).toBe('full-auto');
        expect(codexAcpModeForPermissionMode('yolo')).toBe('full-auto');
    });

    it('does not invent ACP presets for non-Codex permission modes', () => {
        expect(codexAcpModeForPermissionMode('acceptEdits')).toBeNull();
        expect(codexAcpModeForPermissionMode(undefined)).toBeNull();
    });
});
