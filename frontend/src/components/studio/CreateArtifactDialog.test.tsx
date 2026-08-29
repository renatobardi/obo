import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { CreateArtifactDialog } from './CreateArtifactDialog'
import { useRunStudioKind } from '@/lib/hooks/use-studio'
import { STUDIO_KINDS } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'

// t returns the key (global setup mock)
const mutateAsync = vi.fn().mockResolvedValue({ id: 'note-1' })
vi.mock('@/lib/hooks/use-studio', () => ({
  useRunStudioKind: vi.fn(),
}))

const briefing = STUDIO_KINDS.find((k) => k.id === 'briefing')!
const filledContext: ContextSelections = { sources: { 's:1': 'full' }, notes: {} }
const emptyContext: ContextSelections = { sources: { 's:1': 'off' }, notes: {} }

function renderDialog(context: ContextSelections, onOpenChange = vi.fn()) {
  return render(
    <CreateArtifactDialog
      open
      onOpenChange={onOpenChange}
      notebookId="nb-1"
      kind={briefing}
      context={context}
    />,
  )
}

describe('CreateArtifactDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRunStudioKind).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useRunStudioKind>)
  })

  it('renders a chip for every kind except podcast', () => {
    renderDialog(filledContext)
    expect(screen.getByRole('button', { name: /studio\.kindMindmap/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /studio\.kindPodcast/ })).not.toBeInTheDocument()
  })

  it('keeps the title field when switching kind via a chip', () => {
    renderDialog(filledContext)
    const titleInput = screen.getByLabelText('studio.titleLabel') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'Q3 costs' } })

    fireEvent.click(screen.getByRole('button', { name: /studio\.kindQuiz/ }))

    expect((screen.getByLabelText('studio.titleLabel') as HTMLInputElement).value).toBe('Q3 costs')
  })

  it('disables Generate when the context is empty', () => {
    renderDialog(emptyContext)
    expect(screen.getByRole('button', { name: 'studio.generate' })).toBeDisabled()
  })

  it('runs the selected kind with the typed focus and closes on success', async () => {
    const onOpenChange = vi.fn()
    renderDialog(filledContext, onOpenChange)

    fireEvent.change(screen.getByLabelText('studio.focusLabel'), { target: { value: 'pricing' } })
    fireEvent.click(screen.getByRole('button', { name: 'studio.generate' }))

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ notebookId: 'nb-1', focus: 'pricing', context: filledContext }),
    )
    expect(mutateAsync.mock.calls[0][0].kind.id).toBe('briefing')
    await Promise.resolve()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
