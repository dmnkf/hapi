import type { SessionPermissionMode } from '@/api/types';

export function codexAcpModeForPermissionMode(mode: SessionPermissionMode | undefined): string | null {
    switch (mode) {
        case 'read-only':
            return 'read-only';
        case 'safe-yolo':
        case 'yolo':
            return 'full-auto';
        case 'default':
            return 'suggest';
        default:
            return null;
    }
}
