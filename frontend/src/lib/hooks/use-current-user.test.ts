import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useCurrentUser } from './use-current-user'

type AuthCallback = (user: unknown) => void
let authCallback: AuthCallback = () => {}
let authMode = 'firebase'

vi.mock('@/lib/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { authMode: string }) => unknown) => selector({ authMode }),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: AuthCallback) => {
    authCallback = cb
    return () => {}
  },
}))

vi.mock('@/lib/firebase', () => ({
  getFirebaseAuth: () => ({ __marker: 'auth' }),
}))

describe('useCurrentUser', () => {
  beforeEach(() => {
    authCallback = () => {}
    authMode = 'firebase'
  })

  it('returns null in password mode', () => {
    authMode = 'password'
    const { result } = renderHook(() => useCurrentUser())
    expect(result.current).toBeNull()
  })

  it('derives name from displayName and two-letter initials', () => {
    const { result } = renderHook(() => useCurrentUser())
    act(() => {
      authCallback({ displayName: 'Ada Lovelace', email: 'ada@example.com', photoURL: null })
    })
    expect(result.current).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      photoURL: null,
      initials: 'AL',
    })
  })

  it('falls back to the local part of the email when displayName is missing', () => {
    const { result } = renderHook(() => useCurrentUser())
    act(() => {
      authCallback({ displayName: null, email: 'grace@example.com', photoURL: null })
    })
    expect(result.current?.name).toBe('grace')
    expect(result.current?.initials).toBe('GR')
  })

  it('returns null when Firebase reports no user', () => {
    const { result } = renderHook(() => useCurrentUser())
    act(() => authCallback(null))
    expect(result.current).toBeNull()
  })
})
