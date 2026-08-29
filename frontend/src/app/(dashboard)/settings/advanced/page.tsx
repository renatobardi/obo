'use client'

import { RebuildEmbeddings } from './components/RebuildEmbeddings'
import { SystemInfo } from './components/SystemInfo'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function AdvancedPage() {
  const { t } = useTranslation()
  return (
    <div className="p-6">
      <div className="max-w-4xl space-y-6">
        <p className="text-muted-foreground">{t('advanced.desc')}</p>

        <SystemInfo />
        <RebuildEmbeddings />
      </div>
    </div>
  )
}
