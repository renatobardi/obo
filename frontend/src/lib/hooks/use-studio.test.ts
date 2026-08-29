import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useRunStudioKind } from './use-studio'
import { transformationsApi } from '@/lib/api/transformations'
import { chatApi } from '@/lib/api/chat'
import { notesApi } from '@/lib/api/notes'
import { ARTIFACT_KINDS } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'

// useTranslation + use-toast: t returns the key; toast is a spy we can read.
const toastSpy = vi.fn()
vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}))

vi.mock('@/lib/api/transformations', () => ({
  transformationsApi: { list: vi.fn(), create: vi.fn(), execute: vi.fn() },
}))
vi.mock('@/lib/api/chat', () => ({
  chatApi: { buildContext: vi.fn() },
}))
vi.mock('@/lib/api/notes', () => ({
  notesApi: { create: vi.fn() },
}))

const briefing = ARTIFACT_KINDS.find((k) => k.id === 'briefing')!

const context: ContextSelections = {
  sources: { 's:1': 'full', 's:2': 'insights', 's:3': 'off' },
  notes: { 'n:1': 'full', 'n:2': 'off' },
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useRunStudioKind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chatApi.buildContext).mockResolvedValue({
      context: { sources: [{ id: 's:1' }], notes: [] },
      token_count: 10,
      char_count: 40,
    })
    vi.mocked(transformationsApi.execute).mockResolvedValue({
      output: 'GENERATED',
      transformation_id: 't-1',
      model_id: null,
    })
    vi.mocked(notesApi.create).mockResolvedValue({
      id: 'note-1',
      title: 'My briefing',
      content: 'GENERATED',
      note_type: 'ai',
      created: '',
      updated: '',
    })
  })

  it('reuses an existing transformation, maps context modes and saves an AI note', async () => {
    vi.mocked(transformationsApi.list).mockResolvedValue([
      { id: 't-1', name: 'studio_briefing', title: '', description: '', prompt: '', apply_default: false, model_id: null, created: '', updated: '' },
    ])

    const { result } = renderHook(() => useRunStudioKind(), { wrapper })
    await result.current.mutateAsync({
      kind: briefing,
      notebookId: 'nb-1',
      title: 'My briefing',
      focus: 'costs',
      context,
    })

    expect(transformationsApi.create).not.toHaveBeenCalled()
    expect(chatApi.buildContext).toHaveBeenCalledWith({
      notebook_id: 'nb-1',
      context_config: {
        sources: { 's:1': 'full content', 's:2': 'insights', 's:3': 'not in' },
        notes: { 'n:1': 'full content', 'n:2': 'not in' },
      },
    })
    const execArg = vi.mocked(transformationsApi.execute).mock.calls[0][0]
    expect(execArg.transformation_id).toBe('t-1')
    expect(execArg.input_text).toContain('"id": "s:1"')
    expect(execArg.input_text).toContain('Focus: costs')
    expect(notesApi.create).toHaveBeenCalledWith({
      title: 'My briefing',
      content: 'GENERATED',
      note_type: 'ai',
      notebook_id: 'nb-1',
    })
  })

  it('creates the transformation from the fallback prompt when it does not exist', async () => {
    vi.mocked(transformationsApi.list).mockResolvedValue([])
    vi.mocked(transformationsApi.create).mockResolvedValue({
      id: 't-new', name: 'studio_briefing', title: '', description: '', prompt: '', apply_default: false, model_id: null, created: '', updated: '',
    })

    const { result } = renderHook(() => useRunStudioKind(), { wrapper })
    await result.current.mutateAsync({ kind: briefing, notebookId: 'nb-1', context })

    expect(transformationsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'studio_briefing', prompt: briefing.fallbackPrompt, apply_default: false }),
    )
    expect(vi.mocked(transformationsApi.execute).mock.calls[0][0].transformation_id).toBe('t-new')
  })

  it('omits the Focus line and falls back to the untitled key when no title/focus given', async () => {
    vi.mocked(transformationsApi.list).mockResolvedValue([
      { id: 't-1', name: 'studio_briefing', title: '', description: '', prompt: '', apply_default: false, model_id: null, created: '', updated: '' },
    ])

    const { result } = renderHook(() => useRunStudioKind(), { wrapper })
    await result.current.mutateAsync({ kind: briefing, notebookId: 'nb-1', context })

    expect(vi.mocked(transformationsApi.execute).mock.calls[0][0].input_text).not.toContain('Focus:')
    expect(vi.mocked(notesApi.create).mock.calls[0][0].title).toBe('studio.untitled')
  })

  it('toasts a success message after saving', async () => {
    vi.mocked(transformationsApi.list).mockResolvedValue([
      { id: 't-1', name: 'studio_briefing', title: '', description: '', prompt: '', apply_default: false, model_id: null, created: '', updated: '' },
    ])

    const { result } = renderHook(() => useRunStudioKind(), { wrapper })
    await result.current.mutateAsync({ kind: briefing, notebookId: 'nb-1', context })

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'studio.created' })),
    )
  })
})
