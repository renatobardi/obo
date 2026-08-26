'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function useAuth() {
  const router = useRouter()
  const {
    isAuthenticated,
    isLoading,
    login,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    logout,
    checkAuth,
    checkAuthRequired,
    error,
    hasHydrated,
    authRequired,
    authMode
  } = useAuthStore()

  useEffect(() => {
    // Only check auth after the store has hydrated from localStorage
    if (hasHydrated) {
      // First check if auth is required
      if (authRequired === null) {
        checkAuthRequired().then((required) => {
          // If auth is required, check if we have valid credentials
          if (required) {
            checkAuth()
          }
        })
      } else if (authRequired) {
        // Auth is required, check credentials
        checkAuth()
      }
      // If authRequired === false, we're already authenticated (set in checkAuthRequired)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, authRequired])

  const redirectAfterLogin = () => {
    const redirectPath = sessionStorage.getItem('redirectAfterLogin')
    if (redirectPath) {
      sessionStorage.removeItem('redirectAfterLogin')
      router.push(redirectPath)
    } else {
      router.push('/notebooks')
    }
  }

  // Shared by every sign-in method (password, Google, email login, email
  // sign-up): redirect on success, leave the caller on the login screen
  // (with its error already set by the store) otherwise.
  const withRedirect = <Args extends unknown[]>(action: (...args: Args) => Promise<boolean>) => {
    return async (...args: Args) => {
      const success = await action(...args)
      if (success) {
        redirectAfterLogin()
      }
      return success
    }
  }

  const handleLogin = withRedirect(login)
  const handleGoogleLogin = withRedirect(loginWithGoogle)
  const handleEmailLogin = withRedirect(loginWithEmail)
  const handleEmailSignUp = withRedirect(signUpWithEmail)

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return {
    isAuthenticated,
    isLoading: isLoading || !hasHydrated, // Treat lack of hydration as loading
    error,
    authMode,
    login: handleLogin,
    loginWithGoogle: handleGoogleLogin,
    loginWithEmail: handleEmailLogin,
    signUpWithEmail: handleEmailSignUp,
    logout: handleLogout
  }
}