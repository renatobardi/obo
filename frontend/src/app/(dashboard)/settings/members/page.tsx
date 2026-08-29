'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useInvites,
  useMembers,
  useCreateInvite,
  useRevokeInvite,
  useRemoveMember,
} from '@/lib/hooks/use-invites'
import { Copy, Trash2, Users, Mail } from 'lucide-react'
import { useToast } from '@/lib/hooks/use-toast'

export default function MembersPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const { data: invites, isLoading: invitesLoading } = useInvites()
  const { data: members, isLoading: membersLoading } = useMembers()
  const createInvite = useCreateInvite()
  const revokeInvite = useRevokeInvite()
  const removeMember = useRemoveMember()
  const { toast } = useToast()

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    createInvite.mutate(email, {
      onSuccess: () => setEmail(''),
    })
  }

  const copyInviteLink = (token: string) => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/join?token=${token}`
    void navigator.clipboard.writeText(url).then(() => {
      toast({
        title: t('common.success'),
        description: t('members.linkCopied'),
      })
    })
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {t('members.inviteByEmail')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInvite} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={t('members.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={createInvite.isPending}
                  />
                  <Button type="submit" disabled={createInvite.isPending || !email.trim()}>
                    {createInvite.isPending ? t('common.saving') : t('members.sendInvite')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>{t('members.pendingInvites')}</CardTitle>
              </CardHeader>
              <CardContent>
                {invitesLoading ? (
                  <LoadingSpinner />
                ) : !invites?.length ? (
                  <p className="text-muted-foreground">{t('members.noPendingInvites')}</p>
                ) : (
                  <div className="space-y-2">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {t('members.expires', { date: new Date(invite.expires_at).toLocaleDateString() })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyInviteLink(invite.token)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => revokeInvite.mutate(invite.token)}
                            disabled={revokeInvite.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t('members.members')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <LoadingSpinner />
                ) : !members?.length ? (
                  <p className="text-muted-foreground">{t('members.noMembers')}</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <p className="font-medium">{member.email || member.id}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeMember.mutate(member.id)}
                          disabled={removeMember.isPending}
                        >
                          {t('members.remove')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
      </div>
    </div>
  )
}
