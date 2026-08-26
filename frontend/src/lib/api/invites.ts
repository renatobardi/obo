import apiClient from './client'
import { Invite, Member, CreateInviteRequest } from '@/lib/types/api'

export const invitesApi = {
  listInvites: async () => {
    const response = await apiClient.get<Invite[]>('/invites')
    return response.data
  },

  createInvite: async (data: CreateInviteRequest) => {
    const response = await apiClient.post<Invite>('/invites', data)
    return response.data
  },

  revokeInvite: async (token: string) => {
    const response = await apiClient.delete<Invite>(`/invites/${token}`)
    return response.data
  },

  previewInvite: async (token: string) => {
    const response = await apiClient.get<Invite>(`/invites/preview/${token}`)
    return response.data
  },

  listMembers: async () => {
    const response = await apiClient.get<Member[]>('/tenants/members')
    return response.data
  },

  removeMember: async (userId: string) => {
    const response = await apiClient.delete<{ ok: boolean }>(`/tenants/members/${userId}`)
    return response.data
  },
}
