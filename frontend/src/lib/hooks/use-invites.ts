import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invitesApi } from '@/lib/api/invites'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'

export function useInvites() {
  return useQuery({
    queryKey: QUERY_KEYS.invites,
    queryFn: () => invitesApi.listInvites(),
  })
}

export function useMembers() {
  return useQuery({
    queryKey: QUERY_KEYS.members,
    queryFn: () => invitesApi.listMembers(),
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (email: string) => invitesApi.createInvite({ email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites })
      toast({
        title: t('common.success'),
        description: t('members.inviteSent'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key), 'members.failedToLoad'),
        variant: 'destructive',
      })
    },
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (token: string) => invitesApi.revokeInvite(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites })
      toast({
        title: t('common.success'),
        description: t('members.revokeSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key), 'members.failedToLoad'),
        variant: 'destructive',
      })
    },
  })
}

export function useRemoveMember() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (userId: string) => invitesApi.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.members })
      toast({
        title: t('common.success'),
        description: t('members.removeSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key), 'members.failedToLoad'),
        variant: 'destructive',
      })
    },
  })
}

export function usePreviewInvite(token?: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.invitePreview(token || ''),
    queryFn: () => invitesApi.previewInvite(token || ''),
    enabled: Boolean(token),
  })
}
