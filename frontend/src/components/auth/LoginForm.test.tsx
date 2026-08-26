import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

// Firebase SDK mocked at the boundary (#27/#28 AC): LoginForm never talks to
// firebase/auth directly, only through useAuth()'s login*/signUp* actions -
// which are what's mocked here, matching how @/lib/hooks/use-auth is already
// globally mocked in src/test/setup.ts for every other component test. This
// override replaces that default with per-test control over authMode/loading/error.
const mockLogin = vi.fn()
const mockLoginWithGoogle = vi.fn()
const mockLoginWithEmail = vi.fn()
const mockSignUpWithEmail = vi.fn()
let mockAuthState: {
  login: typeof mockLogin
  loginWithGoogle: typeof mockLoginWithGoogle
  loginWithEmail: typeof mockLoginWithEmail
  signUpWithEmail: typeof mockSignUpWithEmail
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
    mockLoginWithEmail.mockReset().mockResolvedValue(true)
    mockSignUpWithEmail.mockReset().mockResolvedValue(true)
    mockAuthState = {
      login: mockLogin,
      loginWithGoogle: mockLoginWithGoogle,
      loginWithEmail: mockLoginWithEmail,
      signUpWithEmail: mockSignUpWithEmail,
      isLoading: false,
      error: null,
      authMode: 'password',
    }
  })

  it('renders only the password form in password mode', async () => {
    render(<LoginForm />)

    expect(await screen.findByPlaceholderText('auth.passwordPlaceholder')).toBeInTheDocument()
    expect(screen.queryByText('auth.signInWithGoogle')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('auth.emailPlaceholder')).not.toBeInTheDocument()
  })

  it('renders a Google button and an email/password form in firebase mode', async () => {
    mockAuthState.authMode = 'firebase'
    render(<LoginForm />)

    expect(await screen.findByText('auth.signInWithGoogle')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('auth.emailPlaceholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('auth.passwordPlaceholder')).toBeInTheDocument()
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

    const buttons = await screen.findAllByText('auth.signingIn')
    expect(buttons[0].closest('button')).toBeDisabled()
  })

  describe('email/password form (firebase mode)', () => {
    beforeEach(() => {
      mockAuthState.authMode = 'firebase'
    })

    it('defaults to sign-in and calls loginWithEmail on submit', async () => {
      render(<LoginForm />)

      fireEvent.change(await screen.findByPlaceholderText('auth.emailPlaceholder'), {
        target: { value: 'alice@example.com' },
      })
      fireEvent.change(screen.getByPlaceholderText('auth.passwordPlaceholder'), {
        target: { value: 'hunter2' },
      })
      fireEvent.click(screen.getByText('auth.signIn'))

      await waitFor(() =>
        expect(mockLoginWithEmail).toHaveBeenCalledWith('alice@example.com', 'hunter2')
      )
      expect(mockSignUpWithEmail).not.toHaveBeenCalled()
    })

    it('switches to sign-up mode and calls signUpWithEmail on submit', async () => {
      render(<LoginForm />)

      fireEvent.click(await screen.findByText('auth.switchToSignUp'))

      expect(screen.getByText('auth.createAccount')).toBeInTheDocument()
      expect(screen.getByText('auth.switchToSignIn')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText('auth.emailPlaceholder'), {
        target: { value: 'bob@example.com' },
      })
      fireEvent.change(screen.getByPlaceholderText('auth.passwordPlaceholder'), {
        target: { value: 'hunter2' },
      })
      fireEvent.click(screen.getByText('auth.createAccount'))

      await waitFor(() =>
        expect(mockSignUpWithEmail).toHaveBeenCalledWith('bob@example.com', 'hunter2')
      )
      expect(mockLoginWithEmail).not.toHaveBeenCalled()
    })

    it('does not submit with an empty email or password', async () => {
      render(<LoginForm />)

      const submit = await screen.findByText('auth.signIn')
      expect(submit.closest('button')).toBeDisabled()
    })
  })
})
