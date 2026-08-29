import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { NotebookEmptyState } from './NotebookEmptyState'

vi.mock('@/components/sources/AddSourceDialog', () => ({
  AddSourceDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-source-dialog" /> : null,
}))

vi.mock('@/components/sources/AddExistingSourceDialog', () => ({
  AddExistingSourceDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-existing-dialog" /> : null,
}))

describe('NotebookEmptyState', () => {
  it('shows the single call to action', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    expect(screen.getByText('notebooks.emptyTitle')).toBeDefined()
    expect(screen.getByText('notebooks.emptyDesc')).toBeDefined()
    expect(screen.getByText('sources.supportedFormats')).toBeDefined()
  })

  it('opens AddSourceDialog from each of the three buttons', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    for (const key of ['sources.chooseFiles', 'sources.pasteLink', 'sources.writeText']) {
      fireEvent.click(screen.getByRole('button', { name: key }))
      expect(screen.getByTestId('add-source-dialog')).toBeDefined()
    }
  })

  it('opens AddExistingSourceDialog from the reuse link', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'sources.addExisting' }))
    expect(screen.getByTestId('add-existing-dialog')).toBeDefined()
  })
})
