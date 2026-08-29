import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

import { languages, type LanguageCode } from '@/lib/locales'
import type { Theme } from '@/lib/stores/theme-store'

/**
 * Single source for the language and theme pickers shared by the sidebar
 * account menu and the standalone Theme/Language toggles. The locale roster
 * is derived from `languages` (the i18n config) so it can't drift; only the
 * translation-key mapping lives here.
 */

const LANGUAGE_LABEL_KEYS: Record<LanguageCode, string> = {
  'en-US': 'common.english',
  'ca-ES': 'common.catalan',
  'de-DE': 'common.german',
  'es-ES': 'common.spanish',
  'fr-FR': 'common.french',
  'it-IT': 'common.italian',
  'ja-JP': 'common.japanese',
  'pl-PL': 'common.polish',
  'pt-BR': 'common.portuguese',
  'ru-RU': 'common.russian',
  'tr-TR': 'common.turkish',
  'zh-CN': 'common.chinese',
  'zh-TW': 'common.traditionalChinese',
  'bn-IN': 'common.bengali',
}

export type LanguageOption = { code: LanguageCode; labelKey: string }

export const LANGUAGE_OPTIONS: LanguageOption[] = languages.map(({ code }) => ({
  code,
  labelKey: LANGUAGE_LABEL_KEYS[code],
}))

export type ThemeOption = { value: Theme; labelKey: string; icon: LucideIcon }

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', labelKey: 'common.light', icon: Sun },
  { value: 'dark', labelKey: 'common.dark', icon: Moon },
  { value: 'system', labelKey: 'common.system', icon: Monitor },
]
