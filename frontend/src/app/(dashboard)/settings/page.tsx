'use client'

import { SettingsForm } from './components/SettingsForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const { refetch } = useSettings()

  return (
    <div className="p-6">
      <div className="max-w-4xl space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <SettingsForm />
      </div>
    </div>
  )
}
