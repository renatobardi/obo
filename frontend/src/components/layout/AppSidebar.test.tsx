/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AppSidebar } from './AppSidebar'
import { useSidebarStore } from '@/lib/stores/sidebar-store'

// Mock Tooltip components to avoid Radix UI async issues in tests
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Password-mode has no identity to show, so UserMenu renders nothing.
vi.mock('@/lib/hooks/use-current-user', () => ({
  useCurrentUser: () => null,
}))

describe('AppSidebar', () => {
  it('renders a flat navigation without group titles', () => {
    render(<AppSidebar />)

    expect(screen.getByText('common.appName')).toBeDefined()
    expect(screen.getByText('navigation.sources')).toBeDefined()
    expect(screen.getByText('navigation.notebooks')).toBeDefined()
    expect(screen.getByText('navigation.askAndSearch')).toBeDefined()
    expect(screen.getByText('navigation.studio')).toBeDefined()
    expect(screen.getByText('navigation.settings')).toBeDefined()

    // Group headings and the standalone theme/language toggles are gone.
    expect(screen.queryByText('navigation.collect')).toBeNull()
    expect(screen.queryByText('navigation.manage')).toBeNull()
    expect(screen.queryByText('common.theme')).toBeNull()
    expect(screen.queryByText('common.language')).toBeNull()
  })

  it('toggles collapse state when clicking handle', () => {
    const toggleCollapse = vi.fn()
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: false,
      toggleCollapse,
    } as any)

    render(<AppSidebar />)

    fireEvent.click(screen.getByTestId('sidebar-toggle'))

    expect(toggleCollapse).toHaveBeenCalled()
  })

  it('shows collapsed view when isCollapsed is true', () => {
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: true,
      toggleCollapse: vi.fn(),
    } as any)

    render(<AppSidebar />)

    expect(screen.queryByText('common.appName')).toBeNull()
  })
})
