import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { NotebookEmptyState } from './NotebookEmptyState'

vi.mock('@/components/sources/AddSourceDialog', () => ({
  AddSourceDialog: ({
    open,
    defaultType,
    initialFiles,
  }: {
    open: boolean
    defaultType?: string
    initialFiles?: File[]
  }) =>
    open ? (
      <div
        data-testid="add-source-dialog"
        data-type={defaultType}
        data-files={initialFiles?.length ?? 0}
      />
    ) : null,
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

  it('opens AddSourceDialog on the matching tab for each button', () => {
    const cases: [string, string][] = [
      ['sources.chooseFiles', 'upload'],
      ['sources.pasteLink', 'link'],
      ['sources.writeText', 'text'],
    ]
    for (const [label, type] of cases) {
      const { unmount } = render(<NotebookEmptyState notebookId="notebook:1" />)
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByTestId('add-source-dialog')).toHaveAttribute('data-type', type)
      unmount()
    }
  })

  it('opens the upload tab with the dropped files when files are dropped', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    fireEvent.drop(screen.getByTestId('notebook-empty-dropzone'), {
      dataTransfer: { files: [file] },
    })
    const dialog = screen.getByTestId('add-source-dialog')
    expect(dialog).toHaveAttribute('data-type', 'upload')
    expect(dialog).toHaveAttribute('data-files', '1')
  })

  it('a drop after a non-upload CTA still opens on upload with the files', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'sources.pasteLink' }))
    fireEvent.drop(screen.getByTestId('notebook-empty-dropzone'), {
      dataTransfer: { files: [new File(['x'], 'a.pdf')] },
    })
    const dialog = screen.getByTestId('add-source-dialog')
    expect(dialog).toHaveAttribute('data-type', 'upload')
    expect(dialog).toHaveAttribute('data-files', '1')
  })

  it('a later CTA does not carry the previous drop\'s files', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    fireEvent.drop(screen.getByTestId('notebook-empty-dropzone'), {
      dataTransfer: { files: [new File(['x'], 'a.pdf')] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'sources.chooseFiles' }))
    expect(screen.getByTestId('add-source-dialog')).toHaveAttribute('data-files', '0')
  })

  it('opens AddExistingSourceDialog from the reuse link', () => {
    render(<NotebookEmptyState notebookId="notebook:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'sources.reuseFromOtherNotebook' }))
    expect(screen.getByTestId('add-existing-dialog')).toBeDefined()
  })
})
