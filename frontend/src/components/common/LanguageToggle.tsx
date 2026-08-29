'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Languages } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { LANGUAGE_OPTIONS } from '@/lib/i18n-options'

interface LanguageToggleProps {
  iconOnly?: boolean
}

export function LanguageToggle({ iconOnly = false }: LanguageToggleProps) {
  const { language, setLanguage, t } = useTranslation()

  // Keep the actual language code for proper comparison
  const currentLang = language || 'en-US'
  const isActive = (code: string) =>
    currentLang === code || currentLang.startsWith(code.split('-')[0])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={iconOnly ? "ghost" : "outline"} 
          size={iconOnly ? "icon" : "default"} 
          className={iconOnly ? "h-9 w-full sidebar-menu-item" : "w-full justify-start gap-2 sidebar-menu-item"}
        >
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          {!iconOnly && <span>{t('common.language')}</span>}
          <span className="sr-only">{t('navigation.language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGE_OPTIONS.map(({ code, labelKey }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setLanguage(code)}
            className={isActive(code) ? 'bg-accent' : ''}
          >
            <span>{t(labelKey)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
