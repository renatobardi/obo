import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

// Firebase SDK mocked at the boundary (#27 AC): LoginForm never talks to
// firebase/auth directly, only through useAuth()'s loginWithGoogle - which
// is what's mocked here, matching how @/lib/hooks/use-auth is already
// globally mocked in src/test/setup.ts for every other component test. This
// override replaces that default with per-test control over authMode/loading/error.
const mockLogin = vi.fn()
const mockLoginWithGoogle = vi.fn()
let mockAuthState: {
  login: typeof mockLogin
  loginWithGoogle: typeof mockLoginWithGoogle
  isLoading: boolean
  error: string | null
  authMode: 'password' | 'firebase'
}

vi.mock('@/lib/hooks/use-auth', () => ({
  useAuth: () => mockAuthState,
}))

const mockCheckAuthRequired = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/stores/auth-store', () => ({
  useAuthStore: () => ({
    authRequired: true,
    checkAuthRequired: mockCheckAuthRequired,
    hasHydrated: true,
    isAuthenticated: false,
  }),
}))

vi.mock('@/lib/config', () => ({
  getConfig: vi.fn().mockResolvedValue({
    apiUrl: 'http://localhost:5055',
    version: '1.0.0',
    buildTime: '2026-01-01T00:00:00Z',
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    mockLogin.mockReset().mockResolvedValue(true)
    mockLoginWithGoogle.mockReset().mockResolvedValue(true)
    mockAuthState = {
      login: mockLogin,
      loginWithGoogle: mockLoginWithGoogle,
      isLoading: false,
      error: null,
      authMode: 'password',
    }
  })

  it('renders the password form in password mode, not a Google button', async () => {
    render(<LoginForm />)

    expect(await screen.findByPlaceholderText('auth.passwordPlaceholder')).toBeInTheDocument()
    expect(screen.queryByText('auth.signInWithGoogle')).not.toBeInTheDocument()
  })

  it('renders a Google sign-in button in firebase mode, not the password field', async () => {
    mockAuthState.authMode = 'firebase'
    render(<LoginForm />)

    expect(await screen.findByText('auth.signInWithGoogle')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('auth.passwordPlaceholder')).not.toBeInTheDocument()
  })

  it('calls loginWithGoogle when the Google button is clicked', async () => {
    mockAuthState.authMode = 'firebase'
    render(<LoginForm />)

    const button = await screen.findByText('auth.signInWithGoogle')
    fireEvent.click(button)

    await waitFor(() => expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1))
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('shows the error from a failed Google sign-in', async () => {
    mockAuthState.authMode = 'firebase'
    mockAuthState.error = 'Sign-in was cancelled'
    render(<LoginForm />)

    expect(await screen.findByText('Sign-in was cancelled')).toBeInTheDocument()
  })

  it('disables the Google button while a sign-in is in progress', async () => {
    mockAuthState.authMode = 'firebase'
    mockAuthState.isLoading = true
    render(<LoginForm />)

    const button = await screen.findByText('auth.signingIn')
    expect(button.closest('button')).toBeDisabled()
  })
})
