import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import ProfilePage from './page'

const mockUser = vi.fn()
vi.mock('@/lib/hooks/use-current-user', () => ({
  useCurrentUser: () => mockUser(),
}))

describe('ProfilePage', () => {
  it('shows the local-account note when there is no signed-in user', () => {
    mockUser.mockReturnValue(null)
    render(<ProfilePage />)
    expect(screen.getByText('settings.localAccountDesc')).toBeDefined()
    expect(screen.getByText('settings.preferences')).toBeDefined()
    expect(screen.getByText('settings.workspace')).toBeDefined()
  })

  it('shows identity and initials when signed in', () => {
    mockUser.mockReturnValue({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      photoURL: null,
      initials: 'AL',
    })
    render(<ProfilePage />)
    expect(screen.getByText('Ada Lovelace')).toBeDefined()
    expect(screen.getByText('ada@example.com')).toBeDefined()
    expect(screen.getByText('AL')).toBeDefined()
    expect(screen.queryByText('settings.localAccountDesc')).toBeNull()
  })
})
