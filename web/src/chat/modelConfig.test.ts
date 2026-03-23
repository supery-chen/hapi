import { describe, expect, it } from 'vitest'
import { getContextBudgetTokens } from './modelConfig'

describe('getContextBudgetTokens', () => {
    it('returns null for codex sessions until an explicit budget is provided', () => {
        expect(getContextBudgetTokens('gpt-5.4', 'codex')).toBeNull()
    })
})
