'use client'

import Link from 'next/link'
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun, User, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/hooks/use-auth'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useTheme, type Theme } from '@/lib/stores/theme-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface UserMenuProps {
  isCollapsed?: boolean
}

const THEME_OPTIONS: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'common.light', icon: Sun },
  { value: 'dark', labelKey: 'common.dark', icon: Moon },
  { value: 'system', labelKey: 'common.system', icon: Monitor },
]

const LOCALE_OPTIONS: { code: string; labelKey: string }[] = [
  { code: 'en-US', labelKey: 'common.english' },
  { code: 'ca-ES', labelKey: 'common.catalan' },
  { code: 'de-DE', labelKey: 'common.german' },
  { code: 'es-ES', labelKey: 'common.spanish' },
  { code: 'fr-FR', labelKey: 'common.french' },
  { code: 'it-IT', labelKey: 'common.italian' },
  { code: 'ja-JP', labelKey: 'common.japanese' },
  { code: 'pl-PL', labelKey: 'common.polish' },
  { code: 'pt-BR', labelKey: 'common.portuguese' },
  { code: 'ru-RU', labelKey: 'common.russian' },
  { code: 'tr-TR', labelKey: 'common.turkish' },
  { code: 'zh-CN', labelKey: 'common.chinese' },
  { code: 'zh-TW', labelKey: 'common.traditionalChinese' },
  { code: 'bn-IN', labelKey: 'common.bengali' },
]

export function UserMenu({ isCollapsed = false }: UserMenuProps) {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, language, setLanguage } = useTranslation()

  if (!user) return null

  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fern/15 text-[11px] font-semibold text-sidebar-foreground">
      {user.initials}
    </span>
  )

  const trigger = isCollapsed ? (
    <button
      type="button"
      aria-label={t('common.accountMenu')}
      className="flex w-full items-center justify-center rounded-md p-1 sidebar-menu-item"
    >
      {avatar}
    </button>
  ) : (
    <button
      type="button"
      aria-label={t('common.accountMenu')}
      className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left sidebar-menu-item"
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-sidebar-foreground">
          {user.name}
        </span>
        {user.email && (
          <span className="block truncate text-[11px] text-sidebar-foreground/50">
            {user.email}
          </span>
        )}
      </span>
      <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
    </button>
  )

  return (
    <DropdownMenu>
      {isCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{user.name || t('common.account')}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        side={isCollapsed ? 'right' : 'top'}
        align={isCollapsed ? 'end' : 'start'}
        className="w-56"
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Sun className="h-4 w-4" />
            {t('common.theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {THEME_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => setTheme(value)}
                className={cn('gap-2', theme === value && 'bg-accent')}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Monitor className="h-4 w-4" />
            {t('common.language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {LOCALE_OPTIONS.map(({ code, labelKey }) => (
              <DropdownMenuItem
                key={code}
                onClick={() => setLanguage(code)}
                className={cn('gap-2', language === code && 'bg-accent')}
              >
                <Check
                  className={cn('h-4 w-4', language === code ? 'opacity-100' : 'opacity-0')}
                />
                {t(labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="gap-2">
          <Link href="/settings/profile">
            <User className="h-4 w-4" />
            {t('navigation.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/settings/members">
            <Users className="h-4 w-4" />
            {t('navigation.members')}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={logout} className="gap-2">
          <LogOut className="h-4 w-4" />
          {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
