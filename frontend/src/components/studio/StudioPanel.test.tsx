import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { StudioPanel } from './StudioPanel'
import { useNotes } from '@/lib/hooks/use-notes'
import type { ContextSelections } from '@/lib/types/notebook-context'

vi.mock('@/lib/hooks/use-notes', () => ({ useNotes: vi.fn() }))
vi.mock('@/components/podcasts/GeneratePodcastDialog', () => ({
  GeneratePodcastDialog: ({ open }: { open: boolean }) => (
    <div data-testid="podcast-dialog" data-open={open} />
  ),
}))
vi.mock('./CreateArtifactDialog', () => ({
  CreateArtifactDialog: ({ kind }: { kind: { id: string } }) => (
    <div data-testid="artifact-dialog" data-kind={kind.id} />
  ),
}))

const context: ContextSelections = { sources: {}, notes: {} }

function setNotes(data: unknown) {
  vi.mocked(useNotes).mockReturnValue({ data } as unknown as ReturnType<typeof useNotes>)
}

describe('StudioPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders all 8 output tiles', () => {
    setNotes([])
    render(<StudioPanel notebookId="nb-1" context={context} />)
    for (const key of [
      'studio.kindMindmap', 'studio.kindReport', 'studio.kindBriefing', 'studio.kindFaq',
      'studio.kindTimeline', 'studio.kindFlashcards', 'studio.kindQuiz', 'studio.kindPodcast',
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument()
    }
  })

  it('shows the empty hint when the notebook has no AI notes', () => {
    setNotes([{ id: 'n1', title: 'mine', content: 'x', note_type: 'human' }])
    render(<StudioPanel notebookId="nb-1" context={context} />)
    expect(screen.getByText('studio.emptyHint')).toBeInTheDocument()
  })

  it('lists AI notes under Generated', () => {
    setNotes([
      { id: 'n1', title: 'Briefing A', content: 'body', note_type: 'ai' },
      { id: 'n2', title: 'note', content: 'x', note_type: 'human' },
    ])
    render(<StudioPanel notebookId="nb-1" context={context} />)
    expect(screen.getByText('Briefing A')).toBeInTheDocument()
    expect(screen.queryByText('studio.emptyHint')).not.toBeInTheDocument()
  })

  it('opens the podcast dialog for the podcast tile and the artifact dialog for the rest', () => {
    setNotes([])
    render(<StudioPanel notebookId="nb-1" context={context} />)

    fireEvent.click(screen.getByText('studio.kindMindmap'))
    expect(screen.getByTestId('artifact-dialog')).toHaveAttribute('data-kind', 'mindmap')

    fireEvent.click(screen.getByText('studio.kindPodcast'))
    expect(screen.getByTestId('podcast-dialog')).toHaveAttribute('data-open', 'true')
  })
})
