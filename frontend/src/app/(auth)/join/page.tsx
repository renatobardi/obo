'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { usePreviewInvite } from '@/lib/hooks/use-invites'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function JoinPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { data: invite, isLoading, error } = usePreviewInvite(token)

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('members.inviteByEmail')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('join.invalid')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('join.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('join.invalid')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const loginUrl = `/login?token=${encodeURIComponent(token)}${invite ? `&email=${encodeURIComponent(invite.email)}` : ''}`

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t('join.title')}</CardTitle>
          <CardDescription>
            {t('join.description', { email: invite?.email || '' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={loginUrl}>{t('join.continue')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
