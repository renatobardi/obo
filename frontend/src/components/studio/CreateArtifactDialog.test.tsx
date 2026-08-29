import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'

import { CreateArtifactDialog } from './CreateArtifactDialog'
import { useRunStudioKind } from '@/lib/hooks/use-studio'
import { ARTIFACT_KINDS, type TransformationStudioKind } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'

// t returns the key (global setup mock)
const mutateAsync = vi.fn().mockResolvedValue({ id: 'note-1' })
vi.mock('@/lib/hooks/use-studio', () => ({
  useRunStudioKind: vi.fn(),
}))

const briefing = ARTIFACT_KINDS.find((k) => k.id === 'briefing')!
const filledContext: ContextSelections = { sources: { 's:1': 'full' }, notes: {} }
const emptyContext: ContextSelections = { sources: { 's:1': 'off' }, notes: {} }

// Mirrors StudioPanel: the parent owns the selected kind.
function Harness({ context, onOpenChange = vi.fn() }: { context: ContextSelections; onOpenChange?: () => void }) {
  const [kind, setKind] = useState<TransformationStudioKind>(briefing)
  return (
    <CreateArtifactDialog
      open
      onOpenChange={onOpenChange}
      notebookId="nb-1"
      kind={kind}
      onKindChange={setKind}
      context={context}
    />
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
    render(<Harness context={filledContext} />)
    expect(screen.getByRole('button', { name: /studio\.kindMindmap/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /studio\.kindPodcast/ })).not.toBeInTheDocument()
  })

  it('keeps the title field when switching kind via a chip', () => {
    render(<Harness context={filledContext} />)
    const titleInput = screen.getByLabelText('studio.titleLabel') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'Q3 costs' } })

    fireEvent.click(screen.getByRole('button', { name: /studio\.kindQuiz/ }))

    expect(screen.getByRole('heading', { name: 'studio.kindQuiz' })).toBeInTheDocument()
    expect((screen.getByLabelText('studio.titleLabel') as HTMLInputElement).value).toBe('Q3 costs')
  })

  it('disables Generate when the context is empty', () => {
    render(<Harness context={emptyContext} />)
    expect(screen.getByRole('button', { name: 'studio.generate' })).toBeDisabled()
  })

  it('runs the selected kind with the typed focus and closes on success', async () => {
    const onOpenChange = vi.fn()
    render(<Harness context={filledContext} onOpenChange={onOpenChange} />)

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
