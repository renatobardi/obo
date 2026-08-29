import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Model } from '@/lib/types/models'
import { DefaultModelSelectors } from './DefaultModelSelectors'

vi.mock('@/lib/hooks/use-models', () => ({
  useUpdateModelDefaults: () => ({ mutate: vi.fn() }),
  useAutoAssignDefaults: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('./EmbeddingModelChangeDialog', () => ({
  EmbeddingModelChangeDialog: () => null,
}))

const embeddingModel: Model = {
  id: 'model:embedding',
  name: 'Embedding Model',
  provider: 'test',
  type: 'embedding',
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
}

const ttsModel: Model = {
  ...embeddingModel,
  id: 'model:tts',
  name: 'TTS Model',
  type: 'text_to_speech',
}

describe('DefaultModelSelectors', () => {
  it('explains why a model selector cannot open when no models of that type are registered', () => {
    render(<DefaultModelSelectors models={[]} defaults={{}} />)

    const selectors = [
      screen.getByRole('combobox', { name: /models\.embeddingModelLabel/ }),
      screen.getByRole('combobox', { name: /models\.ttsModelLabel/ }),
    ]

    for (const selector of selectors) {
      expect(selector).toBeDisabled()
      expect(selector).toHaveAccessibleDescription('models.autoAssignNoModels')
    }
  })

  it('keeps selectors enabled when models of their type are registered', () => {
    render(<DefaultModelSelectors models={[embeddingModel, ttsModel]} defaults={{}} />)

    const selectors = [
      screen.getByRole('combobox', { name: /models\.embeddingModelLabel/ }),
      screen.getByRole('combobox', { name: /models\.ttsModelLabel/ }),
    ]

    for (const selector of selectors) {
      expect(selector).not.toBeDisabled()
      expect(selector).not.toHaveAccessibleDescription('models.autoAssignNoModels')
    }
  })
})
