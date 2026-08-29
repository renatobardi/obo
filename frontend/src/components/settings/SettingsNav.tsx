'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, Mic, Shuffle, SlidersHorizontal, UserCircle, Users, Wrench } from 'lucide-react'
import type { TFunction } from 'i18next'

import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'

type Section = {
  href: string
  label: string
  icon: typeof Bot
  exact?: boolean
}

const getSections = (t: TFunction): Section[] => [
  { href: '/settings', label: t('settings.sectionProcessing'), icon: SlidersHorizontal, exact: true },
  { href: '/settings/api-keys', label: t('navigation.models'), icon: Bot },
  { href: '/settings/transformations', label: t('navigation.transformations'), icon: Shuffle },
  { href: '/settings/members', label: t('navigation.members'), icon: Users },
  { href: '/settings/podcast-profiles', label: t('settings.sectionPodcastProfiles'), icon: Mic },
  { href: '/settings/advanced', label: t('navigation.advanced'), icon: Wrench },
  { href: '/settings/profile', label: t('navigation.profile'), icon: UserCircle },
]

export function SettingsNav() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const sections = getSections(t)

  return (
    <nav
      aria-label={t('navigation.settings')}
      className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3"
    >
      {sections.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact
          ? pathname === href
          : pathname === href || pathname?.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              isActive && 'bg-accent text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
