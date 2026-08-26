import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetIdToken = vi.fn().mockResolvedValue('fake-id-token')
const mockSignInWithPopup = vi.fn().mockResolvedValue({
  user: { getIdToken: mockGetIdToken },
})
const mockSignInWithEmailAndPassword = vi.fn().mockResolvedValue({
  user: { getIdToken: mockGetIdToken },
})
const mockCreateUserWithEmailAndPassword = vi.fn().mockResolvedValue({
  user: { getIdToken: mockGetIdToken },
})
const mockGetAuth = vi.fn().mockReturnValue({ __marker: 'auth-instance' })
const mockInitializeApp = vi.fn().mockReturnValue({ __marker: 'app-instance' })
const mockGetApps = vi.fn().mockReturnValue([])

vi.mock('firebase/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
}))

vi.mock('firebase/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithEmailAndPassword: (...args: unknown[]) =>
    mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) =>
    mockCreateUserWithEmailAndPassword(...args),
}))

describe('signInWithGoogle', () => {
  beforeEach(() => {
    // firebase.ts caches its app/auth instance at module scope - reset the
    // module registry so each test gets a fresh (uninitialized) instance,
    // otherwise a later test's assertions about init-vs-reuse would depend
    // on execution order.
    vi.resetModules()
    vi.clearAllMocks()
    mockGetApps.mockReturnValue([])
    mockSignInWithPopup.mockResolvedValue({ user: { getIdToken: mockGetIdToken } })
    mockGetIdToken.mockResolvedValue('fake-id-token')
  })

  it('initializes the Firebase app and returns the ID token', async () => {
    const { signInWithGoogle } = await import('./firebase')
    const token = await signInWithGoogle()

    expect(token).toBe('fake-id-token')
    expect(mockInitializeApp).toHaveBeenCalledTimes(1)
    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1)
  })

  it('reuses an existing Firebase app instead of re-initializing', async () => {
    mockGetApps.mockReturnValue([{ __marker: 'existing-app' }])
    const { signInWithGoogle } = await import('./firebase')
    await signInWithGoogle()

    expect(mockInitializeApp).not.toHaveBeenCalled()
  })

  it('propagates a popup sign-in failure', async () => {
    mockSignInWithPopup.mockRejectedValueOnce(new Error('popup closed by user'))
    const { signInWithGoogle } = await import('./firebase')

    await expect(signInWithGoogle()).rejects.toThrow('popup closed by user')
  })
})

describe('signInWithEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetApps.mockReturnValue([])
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: mockGetIdToken },
    })
    mockGetIdToken.mockResolvedValue('fake-id-token')
  })

  it('signs in with email/password and returns the ID token', async () => {
    const { signInWithEmail } = await import('./firebase')
    const token = await signInWithEmail('alice@example.com', 'hunter2')

    expect(token).toBe('fake-id-token')
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'alice@example.com',
      'hunter2'
    )
  })

  it('propagates a sign-in failure (e.g. wrong password)', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      new Error('Firebase: Error (auth/wrong-password).')
    )
    const { signInWithEmail } = await import('./firebase')

    await expect(signInWithEmail('alice@example.com', 'wrong')).rejects.toThrow(
      'auth/wrong-password'
    )
  })
})

describe('signUpWithEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetApps.mockReturnValue([])
    mockCreateUserWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: mockGetIdToken },
    })
    mockGetIdToken.mockResolvedValue('fake-id-token')
  })

  it('creates an account with email/password and returns the ID token', async () => {
    const { signUpWithEmail } = await import('./firebase')
    const token = await signUpWithEmail('bob@example.com', 'hunter2')

    expect(token).toBe('fake-id-token')
    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'bob@example.com',
      'hunter2'
    )
  })

  it('propagates a sign-up failure (e.g. email already in use)', async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValueOnce(
      new Error('Firebase: Error (auth/email-already-in-use).')
    )
    const { signUpWithEmail } = await import('./firebase')

    await expect(signUpWithEmail('bob@example.com', 'hunter2')).rejects.toThrow(
      'auth/email-already-in-use'
    )
  })
})
