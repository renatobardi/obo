'use client'

import { AppShell } from '@/components/layout/AppShell'
import { SettingsNav } from '@/components/settings/SettingsNav'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b px-6 py-5">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t('navigation.settings')}
          </h1>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <SettingsNav />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </AppShell>
  )
}
