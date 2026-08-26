import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from '@/lib/api/client'
import { getApiUrl } from '@/lib/config'
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/lib/firebase'

type AuthMode = 'password' | 'firebase'

// Shared state-transition shape between login() and loginWithGoogle(): both
// probe/establish a bearer token via a raw fetch (see the inline comments on
// each) and land in one of these two shapes. Error-message derivation stays
// in each action - only the resulting state shape is identical.
function authSuccessState(token: string) {
  return {
    isAuthenticated: true,
    token,
    isLoading: false,
    lastAuthCheck: Date.now(),
    error: null
  }
}

function authFailureState(error: string) {
  return {
    error,
    isLoading: false,
    isAuthenticated: false,
    token: null
  }
}

// A popup closed by the user is an expected cancellation, not a real
// failure worth alarming over.
function mapGoogleSignInError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.includes('popup-closed-by-user')
      ? 'Sign-in was cancelled'
      : error.message
  }
  return 'Google sign-in failed'
}

// Maps the Firebase Auth error codes email/password sign-in and sign-up
// actually raise (see firebase/auth's AuthErrorCodes) to messages a user can
// act on, instead of surfacing "Firebase: Error (auth/wrong-password)." verbatim.
function mapEmailAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Sign-in failed'
  }
  if (
    error.message.includes('auth/wrong-password') ||
    error.message.includes('auth/invalid-credential')
  ) {
    return 'Incorrect email or password.'
  }
  if (error.message.includes('auth/user-not-found')) {
    return 'No account found with that email.'
  }
  if (error.message.includes('auth/email-already-in-use')) {
    return 'An account with that email already exists.'
  }
  if (error.message.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters.'
  }
  if (error.message.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.'
  }
  return error.message
}

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  completeSignupToken: string | null
  isLoading: boolean
  error: string | null
  lastAuthCheck: number | null
  isCheckingAuth: boolean
  hasHydrated: boolean
  authRequired: boolean | null
  authMode: AuthMode
  setHasHydrated: (state: boolean) => void
  setCompleteSignupToken: (token: string | null) => void
  checkAuthRequired: () => Promise<boolean>
  login: (password: string) => Promise<boolean>
  loginWithGoogle: () => Promise<boolean>
  loginWithEmail: (email: string, password: string) => Promise<boolean>
  signUpWithEmail: (email: string, password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      // Shared by loginWithGoogle/loginWithEmail/signUpWithEmail: obtain a
      // Firebase ID token, then provision/look up the tenant via
      // complete-signup (#27) - only how the token is obtained, and how a
      // thrown error maps to a message, differ per caller.
      const completeFirebaseSignIn = async (
        obtainIdToken: () => Promise<string>,
        mapError: (error: unknown) => string
      ): Promise<boolean> => {
        set({ isLoading: true, error: null })
        try {
          const idToken = await obtainIdToken()
          const apiUrl = await getApiUrl()

          // Deliberately raw fetch (not apiClient): this call establishes
          // the token, so it must not go through interceptors that assume
          // one already exists. Include an optional invite token so a new
          // identity can join an existing tenant instead of self-serving one.
          const inviteToken = get().completeSignupToken
          const response = await fetch(`${apiUrl}/api/auth/complete-signup`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              invite_token: inviteToken || undefined,
            })
          })

          if (response.ok) {
            set(authSuccessState(idToken))
            return true
          }
          set(authFailureState(`Failed to complete sign-up (${response.status})`))
          return false
        } catch (error) {
          console.error('Firebase sign-in error:', error)
          set(authFailureState(mapError(error)))
          return false
        }
      }

      return {
        isAuthenticated: false,
        token: null,
        completeSignupToken: null,
        isLoading: false,
        error: null,
        lastAuthCheck: null,
        isCheckingAuth: false,
        hasHydrated: false,
        authRequired: null,
        authMode: 'password' as AuthMode,

        setHasHydrated: (state: boolean) => {
          set({ hasHydrated: state })
        },

        setCompleteSignupToken: (token: string | null) => {
          set({ completeSignupToken: token })
        },

        checkAuthRequired: async () => {
          try {
            const response = await apiClient.get<{ auth_enabled?: boolean; mode?: AuthMode }>(
              '/auth/status',
              { headers: { 'Cache-Control': 'no-store' } }
            )

            const required = response.data.auth_enabled || false
            const mode: AuthMode = response.data.mode === 'firebase' ? 'firebase' : 'password'
            set({ authRequired: required, authMode: mode })

            // If auth is not required, mark as authenticated
            if (!required) {
              set({ isAuthenticated: true, token: 'not-required' })
            }

            return required
          } catch (error) {
            console.error('Failed to check auth status:', error)

            // If it's a network error, set a more helpful error message
            if (axios.isAxiosError(error) && !error.response) {
              set({
                error: 'Unable to connect to server. Please check if the API is running.',
                authRequired: null  // Don't assume auth is required if we can't connect
              })
            } else {
              // For other errors, default to requiring auth to be safe
              set({ authRequired: true })
            }

            // Re-throw the error so the UI can handle it
            throw error
          }
        },

        login: async (password: string) => {
          set({ isLoading: true, error: null })
          try {
            const apiUrl = await getApiUrl()

            // Deliberately raw fetch (not apiClient): this probes a candidate
            // password, so the interceptors must not overwrite the Authorization
            // header with the stored token or hard-redirect on 401.
            const response = await fetch(`${apiUrl}/api/notebooks`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${password}`,
                'Content-Type': 'application/json'
              }
            })

            if (response.ok) {
              set(authSuccessState(password))
              return true
            } else {
              let errorMessage = 'Authentication failed'
              if (response.status === 401) {
                errorMessage = 'Invalid password. Please try again.'
              } else if (response.status === 403) {
                errorMessage = 'Access denied. Please check your credentials.'
              } else if (response.status >= 500) {
                errorMessage = 'Server error. Please try again later.'
              } else {
                errorMessage = `Authentication failed (${response.status})`
              }

              set(authFailureState(errorMessage))
              return false
            }
          } catch (error) {
            console.error('Network error during auth:', error)
            let errorMessage = 'Authentication failed'

            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
              errorMessage = 'Unable to connect to server. Please check if the API is running.'
            } else if (error instanceof Error) {
              errorMessage = `Network error: ${error.message}`
            } else {
              errorMessage = 'An unexpected error occurred during authentication'
            }

            set(authFailureState(errorMessage))
            return false
          }
        },

        loginWithGoogle: () => completeFirebaseSignIn(signInWithGoogle, mapGoogleSignInError),

        loginWithEmail: (email: string, password: string) =>
          completeFirebaseSignIn(() => signInWithEmail(email, password), mapEmailAuthError),

        signUpWithEmail: (email: string, password: string) =>
          completeFirebaseSignIn(() => signUpWithEmail(email, password), mapEmailAuthError),

        logout: () => {
          set({
            isAuthenticated: false,
            token: null,
            error: null
          })
        },

        checkAuth: async () => {
          const state = get()
          const { token, lastAuthCheck, isCheckingAuth, isAuthenticated } = state

          // If already checking, return current auth state
          if (isCheckingAuth) {
            return isAuthenticated
          }

          // If no token, not authenticated
          if (!token) {
            return false
          }

          // If we checked recently (within 30 seconds) and are authenticated, skip
          const now = Date.now()
          if (isAuthenticated && lastAuthCheck && (now - lastAuthCheck) < 30000) {
            return true
          }

          set({ isCheckingAuth: true })

          try {
            const apiUrl = await getApiUrl()

            // Deliberately raw fetch (not apiClient): a 401 here must update
            // store state, not trigger the interceptor's storage-clear/redirect.
            const response = await fetch(`${apiUrl}/api/notebooks`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })

            if (response.ok) {
              set({
                isAuthenticated: true,
                lastAuthCheck: now,
                isCheckingAuth: false
              })
              return true
            } else {
              set({
                isAuthenticated: false,
                token: null,
                lastAuthCheck: null,
                isCheckingAuth: false
              })
              return false
            }
          } catch (error) {
            console.error('checkAuth error:', error)
            set({
              isAuthenticated: false,
              token: null,
              lastAuthCheck: null,
              isCheckingAuth: false
            })
            return false
          }
        }
      }
    },
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      }
    }
  )
)