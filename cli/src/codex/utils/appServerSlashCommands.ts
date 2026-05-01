export type CodexAppServerSlashCommand =
    | {
        type: 'clear';
    }
    | {
        type: 'compact';
    }
    | {
        type: 'review';
        target:
            | { type: 'uncommittedChanges' }
            | { type: 'custom'; instructions: string };
    };

export function parseCodexAppServerSlashCommand(message: string): CodexAppServerSlashCommand | null {
    const match = /^\s*\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i.exec(message);
    if (!match) {
        return null;
    }

    const command = match[1]?.toLowerCase();
    const args = match[2]?.trim() ?? '';

    switch (command) {
        case 'clear':
        case 'c':
        case 'reset':
            return { type: 'clear' };
        case 'compact':
            return { type: 'compact' };
        case 'review':
        case 'r':
            return {
                type: 'review',
                target: args.length > 0
                    ? { type: 'custom', instructions: args }
                    : { type: 'uncommittedChanges' }
            };
        default:
            return null;
    }
}
