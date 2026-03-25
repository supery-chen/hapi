import type { SpawnPermissionMode } from './types'
import { useTranslation } from '@/lib/use-translation'

const PERMISSION_MODE_OPTIONS: Array<{
    value: SpawnPermissionMode
    labelKey: string
    descriptionKey: string
}> = [
    {
        value: 'default',
        labelKey: 'newSession.permissionMode.default',
        descriptionKey: 'newSession.permissionMode.default.desc'
    },
    {
        value: 'safe-yolo',
        labelKey: 'newSession.permissionMode.safeYolo',
        descriptionKey: 'newSession.permissionMode.safeYolo.desc'
    },
    {
        value: 'yolo',
        labelKey: 'newSession.permissionMode.yolo',
        descriptionKey: 'newSession.permissionMode.yolo.desc'
    }
]

export function YoloToggle(props: {
    permissionMode: SpawnPermissionMode
    isDisabled: boolean
    onChange: (value: SpawnPermissionMode) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.permissionMode')}
            </label>
            <div className="flex flex-col gap-2">
                {PERMISSION_MODE_OPTIONS.map((option) => {
                    const selected = props.permissionMode === option.value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            disabled={props.isDisabled}
                            onClick={() => props.onChange(option.value)}
                            className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                                selected
                                    ? 'border-[var(--app-link)] bg-[var(--app-secondary-bg)]'
                                    : 'border-[var(--app-border)] bg-[var(--app-bg)] hover:bg-[var(--app-subtle-bg)]'
                            }`}
                        >
                            <div className="text-sm text-[var(--app-fg)]">
                                {t(option.labelKey)}
                            </div>
                            <div className="text-xs text-[var(--app-hint)]">
                                {t(option.descriptionKey)}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
