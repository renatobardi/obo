import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { UserMenu } from './UserMenu'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockUser = vi.fn()
vi.mock('@/lib/hooks/use-current-user', () => ({
  useCurrentUser: () => mockUser(),
}))

describe('UserMenu', () => {
  it('renders nothing without a signed-in user', () => {
    mockUser.mockReturnValue(null)
    const { container } = render(<UserMenu />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows name and email when expanded', () => {
    mockUser.mockReturnValue({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      photoURL: null,
      initials: 'AL',
    })
    render(<UserMenu />)
    expect(screen.getByText('Ada Lovelace')).toBeDefined()
    expect(screen.getByText('ada@example.com')).toBeDefined()
    expect(screen.getByLabelText('common.accountMenu')).toBeDefined()
  })

  it('collapsed shows only the initials avatar', () => {
    mockUser.mockReturnValue({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      photoURL: null,
      initials: 'AL',
    })
    render(<UserMenu isCollapsed />)
    expect(screen.getByText('AL')).toBeDefined()
    expect(screen.queryByText('ada@example.com')).toBeNull()
  })
})
