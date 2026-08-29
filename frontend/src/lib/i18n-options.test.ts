import { describe, expect, it } from 'vitest'

import { LANGUAGE_OPTIONS, THEME_OPTIONS } from './i18n-options'
import { languages } from './locales'
import { enUS } from './locales/en-US'

const resolve = (key: string) =>
  key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], enUS)

describe('i18n-options', () => {
  it('has one language option per configured locale, in sync', () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.code).sort()).toEqual(
      languages.map((l) => l.code).sort()
    )
  })

  it('maps every language and theme option to a real en-US key', () => {
    for (const { labelKey } of [...LANGUAGE_OPTIONS, ...THEME_OPTIONS]) {
      expect(typeof resolve(labelKey), labelKey).toBe('string')
    }
  })
})
