import { afterEach, describe, expect, it, vi } from 'vitest'

// Node 22+'s experimental global `localStorage` shadows jsdom's own without
// --localstorage-file, so zustand's persist middleware (which the real
// auth-store uses) throws when it's set up. persist() reads `localStorage`
// once, synchronously, the moment auth-store.ts's top-level create(persist(...))
// runs - i.e. at import time. A plain top-level `import` is hoisted by the
// ES module spec above any of this file's own statements (vi.hoisted() only
// reorders relative to vi.mock() factories, not that), so the module under
// test is loaded dynamically, after the stub is in place, instead.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

vi.mock('@/lib/firebase', () => ({
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
}))

vi.mock('@/lib/config', () => ({
  getApiUrl: vi.fn().mockResolvedValue('http://localhost:5055'),
}))

async function loadStore() {
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.resetModules()
  const [{ signInWithGoogle, signInWithEmail, signUpWithEmail }, { useAuthStore }] =
    await Promise.all([import('@/lib/firebase'), import('./auth-store')])
  return {
    useAuthStore,
    mockSignInWithGoogle: vi.mocked(signInWithGoogle),
    mockSignInWithEmail: vi.mocked(signInWithEmail),
    mockSignUpWithEmail: vi.mocked(signUpWithEmail),
  }
}

describe('useAuthStore.loginWithGoogle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the ID token and marks authenticated on a successful complete-signup', async () => {
    const { useAuthStore, mockSignInWithGoogle } = await loadStore()
    mockSignInWithGoogle.mockResolvedValue('fake-id-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await useAuthStore.getState().loginWithGoogle()

    expect(result).toBe(true)
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('fake-id-token')
    expect(state.error).toBeNull()

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5055/api/auth/complete-signup',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-id-token' }),
      })
    )
  })

  it('does not authenticate when complete-signup fails', async () => {
    const { useAuthStore, mockSignInWithGoogle } = await loadStore()
    mockSignInWithGoogle.mockResolvedValue('fake-id-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const result = await useAuthStore.getState().loginWithGoogle()

    expect(result).toBe(false)
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.token).toBeNull()
    expect(state.error).toContain('500')
  })

  it('surfaces a cancelled popup as a friendly message, not an authenticated state', async () => {
    const { useAuthStore, mockSignInWithGoogle } = await loadStore()
    mockSignInWithGoogle.mockRejectedValue(
      new Error('Firebase: Error (auth/popup-closed-by-user).')
    )

    const result = await useAuthStore.getState().loginWithGoogle()

    expect(result).toBe(false)
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.error).toBe('Sign-in was cancelled')
  })
})

describe('useAuthStore.loginWithEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the ID token and marks authenticated on a successful complete-signup', async () => {
    const { useAuthStore, mockSignInWithEmail } = await loadStore()
    mockSignInWithEmail.mockResolvedValue('fake-id-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await useAuthStore.getState().loginWithEmail('alice@example.com', 'hunter2')

    expect(result).toBe(true)
    expect(mockSignInWithEmail).toHaveBeenCalledWith('alice@example.com', 'hunter2')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('fake-id-token')
  })

  it('surfaces a wrong-password error as a friendly message', async () => {
    const { useAuthStore, mockSignInWithEmail } = await loadStore()
    mockSignInWithEmail.mockRejectedValue(
      new Error('Firebase: Error (auth/wrong-password).')
    )

    const result = await useAuthStore.getState().loginWithEmail('alice@example.com', 'wrong')

    expect(result).toBe(false)
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.error).toBe('Incorrect email or password.')
  })

  it('surfaces a user-not-found error as a friendly message', async () => {
    const { useAuthStore, mockSignInWithEmail } = await loadStore()
    mockSignInWithEmail.mockRejectedValue(
      new Error('Firebase: Error (auth/user-not-found).')
    )

    const result = await useAuthStore.getState().loginWithEmail('nobody@example.com', 'x')

    expect(result).toBe(false)
    expect(useAuthStore.getState().error).toBe('No account found with that email.')
  })
})

describe('useAuthStore.signUpWithEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the ID token and marks authenticated on a successful complete-signup', async () => {
    const { useAuthStore, mockSignUpWithEmail } = await loadStore()
    mockSignUpWithEmail.mockResolvedValue('fake-id-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await useAuthStore.getState().signUpWithEmail('bob@example.com', 'hunter2')

    expect(result).toBe(true)
    expect(mockSignUpWithEmail).toHaveBeenCalledWith('bob@example.com', 'hunter2')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('fake-id-token')
  })

  it('surfaces an email-already-in-use error as a friendly message', async () => {
    const { useAuthStore, mockSignUpWithEmail } = await loadStore()
    mockSignUpWithEmail.mockRejectedValue(
      new Error('Firebase: Error (auth/email-already-in-use).')
    )

    const result = await useAuthStore.getState().signUpWithEmail('bob@example.com', 'hunter2')

    expect(result).toBe(false)
    expect(useAuthStore.getState().error).toBe('An account with that email already exists.')
  })

  it('surfaces a weak-password error as a friendly message', async () => {
    const { useAuthStore, mockSignUpWithEmail } = await loadStore()
    mockSignUpWithEmail.mockRejectedValue(new Error('Firebase: Error (auth/weak-password).'))

    const result = await useAuthStore.getState().signUpWithEmail('bob@example.com', '123')

    expect(result).toBe(false)
    expect(useAuthStore.getState().error).toBe('Password must be at least 6 characters.')
  })
})

describe('useAuthStore.checkAuthRequired auth mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults authMode to password before any status check', async () => {
    const { useAuthStore } = await loadStore()
    expect(useAuthStore.getState().authMode).toBe('password')
  })
})
