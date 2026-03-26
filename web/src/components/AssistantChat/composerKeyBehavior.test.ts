import { describe, expect, it } from 'vitest'
import { getComposerKeyAction } from './composerKeyBehavior'

describe('getComposerKeyAction', () => {
    it('submits on desktop plain enter', () => {
        expect(getComposerKeyAction({
            key: 'Enter',
            isTouch: false,
            suggestionsOpen: false
        })).toBe('submit')
    })

    it('keeps enter as newline on touch devices', () => {
        expect(getComposerKeyAction({
            key: 'Enter',
            isTouch: true,
            suggestionsOpen: false
        })).toBe('none')
    })

    it('selects autocomplete with desktop enter', () => {
        expect(getComposerKeyAction({
            key: 'Enter',
            isTouch: false,
            suggestionsOpen: true
        })).toBe('select-suggestion')
    })

    it('selects autocomplete with touch enter', () => {
        expect(getComposerKeyAction({
            key: 'Enter',
            isTouch: true,
            suggestionsOpen: true
        })).toBe('select-suggestion')
    })
})
