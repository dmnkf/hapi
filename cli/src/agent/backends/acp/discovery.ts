import type {
    ModelCapability,
    RuntimeSlashCommand,
    SessionCapabilities,
    SessionRuntimeSlashCommands
} from '@hapi/protocol';
import { asString, isObject } from '@hapi/protocol';

type SelectOption = {
    value: string;
    label?: string;
};

function normalizeName(value: string): string {
    return value.startsWith('/') ? value.slice(1) : value;
}

function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }
    return result;
}

function firstString(...values: unknown[]): string | null {
    for (const value of values) {
        const stringValue = asString(value);
        if (stringValue && stringValue.trim().length > 0) {
            return stringValue.trim();
        }
    }
    return null;
}

function lower(value: unknown): string {
    return (asString(value) ?? '').trim().toLowerCase();
}

function flattenSelectOptions(value: unknown): SelectOption[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const options: SelectOption[] = [];
    for (const entry of value) {
        if (typeof entry === 'string') {
            options.push({ value: entry });
            continue;
        }

        if (!isObject(entry)) {
            continue;
        }

        if (Array.isArray(entry.options) && asString(entry.group)) {
            options.push(...flattenSelectOptions(entry.options));
            continue;
        }

        const optionValue = firstString(entry.value, entry.id, entry.model, entry.name);
        if (!optionValue) {
            continue;
        }
        options.push({
            value: optionValue,
            label: firstString(entry.name, entry.label, entry.displayName, entry.title) ?? undefined
        });
    }
    return options;
}

function normalizeConfigOptions(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry): entry is Record<string, unknown> => isObject(entry));
}

function optionKind(option: Record<string, unknown>): 'model' | 'reasoning' | 'mode' | null {
    const category = lower(option.category);
    const id = lower(option.id);
    const name = lower(option.name);
    const haystack = `${category} ${id} ${name}`;

    if (category === 'model' || id === 'model' || id === 'models' || haystack.includes(' model')) {
        return 'model';
    }
    if (
        category === 'thought_level'
        || id.includes('reasoning')
        || id.includes('thought')
        || id.includes('effort')
        || name.includes('reasoning')
        || name.includes('thought')
        || name.includes('effort')
    ) {
        return 'reasoning';
    }
    if (
        category === 'mode'
        || id === 'mode'
        || id.includes('mode')
        || name.includes('mode')
    ) {
        return 'mode';
    }

    return null;
}

function parseModels(value: unknown, currentValue?: string | null): ModelCapability[] {
    const source = (() => {
        if (Array.isArray(value)) {
            return value;
        }
        if (isObject(value)) {
            for (const key of ['availableModels', 'models', 'available', 'options']) {
                if (Array.isArray(value[key])) {
                    return value[key] as unknown[];
                }
            }
        }
        return [];
    })();

    const models: ModelCapability[] = [];
    for (const entry of source) {
        if (typeof entry === 'string') {
            models.push({
                id: entry,
                isDefault: currentValue === entry || undefined
            });
            continue;
        }

        if (!isObject(entry)) {
            continue;
        }

        const id = firstString(entry.id, entry.value, entry.model, entry.modelId, entry.name);
        if (!id) {
            continue;
        }
        const reasoningEfforts = Array.isArray(entry.reasoningEfforts)
            ? entry.reasoningEfforts.filter((effort): effort is string => typeof effort === 'string')
            : undefined;
        models.push({
            id,
            label: firstString(entry.label, entry.name, entry.displayName, entry.title) ?? undefined,
            reasoningEfforts: reasoningEfforts && reasoningEfforts.length > 0 ? reasoningEfforts : undefined,
            isDefault: typeof entry.isDefault === 'boolean'
                ? entry.isDefault
                : (currentValue === id || undefined)
        });
    }

    const byId = new Map<string, ModelCapability>();
    for (const model of models) {
        byId.set(model.id, model);
    }
    return Array.from(byId.values());
}

function modelsFromSelectOptions(options: SelectOption[], currentValue?: string | null): ModelCapability[] {
    return options.map((option) => ({
        id: option.value,
        label: option.label,
        isDefault: currentValue === option.value || undefined
    }));
}

function collaborationModesFromSessionModes(value: unknown): string[] {
    if (!isObject(value)) {
        return [];
    }

    const availableModes = Array.isArray(value.availableModes) ? value.availableModes : [];
    const modes = availableModes
        .map((mode) => {
            if (typeof mode === 'string') {
                return mode;
            }
            if (!isObject(mode)) {
                return null;
            }
            return firstString(mode.id, mode.value, mode.name);
        })
        .filter((mode): mode is string => Boolean(mode));

    const currentModeId = asString(value.currentModeId);
    return uniqueStrings(currentModeId ? [...modes, currentModeId] : modes);
}

export function capabilitiesFromAcpSessionData(
    data: unknown,
    previous?: SessionCapabilities | null
): SessionCapabilities | null {
    if (!isObject(data)) {
        return null;
    }

    const next: SessionCapabilities = {
        ...(previous ?? {}),
        source: 'dynamic',
        probedAt: Date.now()
    };
    let changed = false;

    const configOptions = normalizeConfigOptions(data.configOptions);
    for (const option of configOptions) {
        const kind = optionKind(option);
        if (!kind) {
            continue;
        }

        const currentValue = asString(option.currentValue);
        const options = flattenSelectOptions(option.options);
        if (options.length === 0) {
            continue;
        }

        if (kind === 'model') {
            next.models = modelsFromSelectOptions(options, currentValue);
            changed = true;
        } else if (kind === 'reasoning') {
            const efforts = uniqueStrings(options.map((entry) => entry.value));
            next.reasoningEfforts = efforts;
            next.effortOptions = efforts;
            changed = true;
        } else if (kind === 'mode') {
            next.collaborationModes = uniqueStrings(options.map((entry) => entry.value));
            changed = true;
        }
    }

    if (!next.models) {
        const currentModel = isObject(data.models)
            ? firstString(data.models.currentModelId, data.models.currentModel, data.models.currentValue)
            : null;
        const models = parseModels(data.models, currentModel);
        if (models.length > 0) {
            next.models = models;
            changed = true;
        }
    }

    if (!next.collaborationModes) {
        const modes = collaborationModesFromSessionModes(data.modes);
        if (modes.length > 0) {
            next.collaborationModes = modes;
            changed = true;
        }
    }

    return changed ? next : null;
}

export function capabilitiesFromAcpUpdate(
    update: unknown,
    previous?: SessionCapabilities | null
): SessionCapabilities | null {
    if (!isObject(update)) {
        return null;
    }

    const updateType = asString(update.sessionUpdate);
    if (updateType === 'config_option_update') {
        return capabilitiesFromAcpSessionData(update, previous);
    }

    if (updateType !== 'current_mode_update') {
        return null;
    }

    const currentModeId = asString(update.currentModeId);
    if (!currentModeId) {
        return null;
    }

    return {
        ...(previous ?? {}),
        collaborationModes: uniqueStrings([...(previous?.collaborationModes ?? []), currentModeId]),
        source: 'dynamic',
        probedAt: Date.now()
    };
}

export function slashCommandsFromAcpUpdate(update: unknown): SessionRuntimeSlashCommands | null {
    if (!isObject(update)) {
        return null;
    }
    if (asString(update.sessionUpdate) !== 'available_commands_update') {
        return null;
    }
    if (!Array.isArray(update.availableCommands)) {
        return null;
    }

    const commands: RuntimeSlashCommand[] = [];
    for (const entry of update.availableCommands) {
        if (!isObject(entry)) {
            continue;
        }

        const name = firstString(entry.name);
        if (!name) {
            continue;
        }
        const input = isObject(entry.input) ? entry.input : null;
        commands.push({
            name: normalizeName(name),
            description: firstString(entry.description) ?? undefined,
            source: 'runtime',
            inputHint: firstString(input?.hint) ?? undefined
        });
    }

    const byName = new Map<string, RuntimeSlashCommand>();
    for (const command of commands) {
        byName.set(command.name, command);
    }

    return {
        commands: Array.from(byName.values()),
        source: 'dynamic',
        updatedAt: Date.now()
    };
}
