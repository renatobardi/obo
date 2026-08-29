'use client'

import Link from 'next/link'
import { LogOut, Users } from 'lucide-react'

import { useAuth } from '@/lib/hooks/use-auth'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useTheme } from '@/lib/stores/theme-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { LANGUAGE_OPTIONS, THEME_OPTIONS } from '@/lib/i18n-options'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function ProfilePage() {
  const { t, language, setLanguage } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { logout } = useAuth()
  const user = useCurrentUser()

  return (
    <div className="p-6">
      <div className="max-w-2xl space-y-6">
        {user ? (
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoURL}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fern/15 text-base font-semibold">
                {user.initials}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{user.name}</p>
              {user.email && (
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.localAccountDesc')}</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.preferences')}</CardTitle>
            <CardDescription>{t('settings.preferencesDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('common.theme')}</p>
              <div className="flex gap-2">
                {THEME_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={theme === value ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setTheme(value)}
                  >
                    <Icon className="h-4 w-4" />
                    {t(labelKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('common.language')}</p>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map(({ code, labelKey }) => (
                    <SelectItem key={code} value={code}>
                      {t(labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.workspace')}</CardTitle>
            <CardDescription>{t('settings.workspaceDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/settings/members">
                <Users className="h-4 w-4" />
                {t('navigation.members')}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Button variant="outline" className="gap-2 text-destructive" onClick={logout}>
          <LogOut className="h-4 w-4" />
          {t('common.signOut')}
        </Button>
      </div>
    </div>
  )
}
