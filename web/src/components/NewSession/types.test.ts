import { describe, expect, it } from 'vitest'
import { MODEL_OPTIONS } from './types'

describe('Codex model options', () => {
    it('includes the supported Codex models in the expected order', () => {
        expect(MODEL_OPTIONS.codex).toEqual([
            { value: 'auto', label: 'Auto' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
            { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
            { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
            { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
        ])
    })
})
