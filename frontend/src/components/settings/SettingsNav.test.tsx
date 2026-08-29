import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SettingsNav } from './SettingsNav'

let pathname = '/settings'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

describe('SettingsNav', () => {
  beforeEach(() => {
    pathname = '/settings'
  })

  it('lists every settings section', () => {
    render(<SettingsNav />)
    for (const key of [
      'settings.sectionProcessing',
      'navigation.models',
      'navigation.transformations',
      'navigation.members',
      'settings.sectionPodcastProfiles',
      'navigation.advanced',
      'navigation.profile',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(key) })).toBeDefined()
    }
  })

  it('marks Processing active only on an exact /settings match', () => {
    pathname = '/settings/members'
    render(<SettingsNav />)
    expect(
      screen.getByRole('link', { name: /settings.sectionProcessing/ })
    ).not.toHaveAttribute('aria-current')
    expect(
      screen.getByRole('link', { name: /navigation.members/ })
    ).toHaveAttribute('aria-current', 'page')
  })

  it('marks a section active on its sub-routes', () => {
    pathname = '/settings/transformations/foo'
    render(<SettingsNav />)
    expect(
      screen.getByRole('link', { name: /navigation.transformations/ })
    ).toHaveAttribute('aria-current', 'page')
  })
})
