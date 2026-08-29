import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DefaultModelSelectors } from './DefaultModelSelectors'

vi.mock('@/lib/hooks/use-models', () => ({
  useUpdateModelDefaults: () => ({ mutate: vi.fn() }),
  useAutoAssignDefaults: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('./EmbeddingModelChangeDialog', () => ({
  EmbeddingModelChangeDialog: () => null,
}))

describe('DefaultModelSelectors', () => {
  it('explains why a model selector cannot open when no models of that type are registered', () => {
    render(<DefaultModelSelectors models={[]} defaults={{}} />)

    const selectors = [
      screen.getByRole('combobox', { name: /models\.embeddingModelLabel/ }),
      screen.getByRole('combobox', { name: 'models.ttsModelLabel' }),
    ]

    for (const selector of selectors) {
      expect(selector).toBeDisabled()
      expect(selector).toHaveAccessibleDescription('models.autoAssignNoModels')
    }
  })
})
