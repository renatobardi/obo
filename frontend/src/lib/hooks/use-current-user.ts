'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'

import { getFirebaseAuth } from '@/lib/firebase'
import { useAuthStore } from '@/lib/stores/auth-store'

export interface CurrentUser {
  name: string
  email: string | null
  photoURL: string | null
  initials: string
}

/**
 * Two letters for the avatar: first letter of the first and last word, or the
 * first two letters when there is a single word.
 */
function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * The signed-in identity to show in the sidebar. Only meaningful in
 * multitenant ('firebase') deployments; password-mode has no user to show
 * and returns null.
 */
export function useCurrentUser(): CurrentUser | null {
  const authMode = useAuthStore((state) => state.authMode)
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    if (authMode !== 'firebase') {
      setUser(null)
      return
    }

    return onAuthStateChanged(getFirebaseAuth(), (fbUser: User | null) => {
      if (!fbUser) {
        setUser(null)
        return
      }
      const name = fbUser.displayName ?? fbUser.email?.split('@')[0] ?? ''
      setUser({
        name,
        email: fbUser.email,
        photoURL: fbUser.photoURL,
        initials: toInitials(name),
      })
    })
  }, [authMode])

  return user
}
