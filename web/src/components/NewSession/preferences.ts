import type { CodexReasoningEffort, SessionType, SpawnPermissionMode } from './types'

const YOLO_STORAGE_KEY = 'hapi:newSession:yolo'
const MODEL_STORAGE_KEY = 'hapi:newSession:model'
const REASONING_STORAGE_KEY = 'hapi:newSession:reasoning'
const SESSION_TYPE_STORAGE_KEY = 'hapi:newSession:sessionType'

const VALID_REASONING_EFFORTS: ReadonlySet<CodexReasoningEffort> = new Set([
    'default',
    'low',
    'medium',
    'high',
    'xhigh'
])

const VALID_SESSION_TYPES: ReadonlySet<SessionType> = new Set([
    'simple',
    'worktree'
])

const VALID_PERMISSION_MODES: ReadonlySet<SpawnPermissionMode> = new Set([
    'default',
    'safe-yolo',
    'yolo'
])

export function loadPreferredSpawnPermissionMode(): SpawnPermissionMode {
    try {
        const value = localStorage.getItem(YOLO_STORAGE_KEY)?.trim()
        if (value === 'true') return 'yolo'
        if (value === 'false' || !value) return 'default'
        return VALID_PERMISSION_MODES.has(value as SpawnPermissionMode)
            ? value as SpawnPermissionMode
            : 'default'
    } catch {
        return 'default'
    }
}

export function savePreferredSpawnPermissionMode(mode: SpawnPermissionMode): void {
    try {
        localStorage.setItem(YOLO_STORAGE_KEY, mode)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredModel(): string {
    try {
        const value = localStorage.getItem(MODEL_STORAGE_KEY)?.trim()
        return value ? value : 'auto'
    } catch {
        return 'auto'
    }
}

export function savePreferredModel(model: string): void {
    try {
        localStorage.setItem(MODEL_STORAGE_KEY, model)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredReasoningEffort(): CodexReasoningEffort {
    try {
        const value = localStorage.getItem(REASONING_STORAGE_KEY)?.trim() as CodexReasoningEffort | undefined
        return value && VALID_REASONING_EFFORTS.has(value) ? value : 'default'
    } catch {
        return 'default'
    }
}

export function savePreferredReasoningEffort(value: CodexReasoningEffort): void {
    try {
        localStorage.setItem(REASONING_STORAGE_KEY, value)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredSessionType(): SessionType {
    try {
        const value = localStorage.getItem(SESSION_TYPE_STORAGE_KEY)?.trim() as SessionType | undefined
        return value && VALID_SESSION_TYPES.has(value) ? value : 'simple'
    } catch {
        return 'simple'
    }
}

export function savePreferredSessionType(value: SessionType): void {
    try {
        localStorage.setItem(SESSION_TYPE_STORAGE_KEY, value)
    } catch {
        // Ignore storage errors
    }
}
