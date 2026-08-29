import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '@/lib/api/chat'
import { notesApi } from '@/lib/api/notes'
import { transformationsApi } from '@/lib/api/transformations'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import type { StudioKind } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'

export interface RunStudioKindParams {
  kind: StudioKind
  notebookId: string
  title?: string
  focus?: string
  context: ContextSelections
}

// Selection modes (`off` / `insights` / `full`) map to the strings the
// build-context endpoint expects, same as the chat column does.
function toContextConfig(context: ContextSelections) {
  const sources: Record<string, string> = {}
  for (const [id, mode] of Object.entries(context.sources)) {
    sources[id] = mode === 'insights' ? 'insights' : mode === 'full' ? 'full content' : 'not in'
  }
  const notes: Record<string, string> = {}
  for (const [id, mode] of Object.entries(context.notes)) {
    notes[id] = mode === 'full' ? 'full content' : 'not in'
  }
  return { sources, notes }
}

/**
 * Runs one Studio output kind end to end: resolve (or create) its
 * transformation, build the notebook context, execute the transformation and
 * save the result as an AI note. Not for podcast — that kind has no
 * transformation and its own dialog.
 */
export function useRunStudioKind() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: async ({ kind, notebookId, title, focus, context }: RunStudioKindParams) => {
      if (!kind.transformationName) {
        throw new Error(`Studio kind "${kind.id}" has no transformation`)
      }

      const existing = await transformationsApi.list()
      const transformation =
        existing.find((item) => item.name === kind.transformationName) ??
        (await transformationsApi.create({
          name: kind.transformationName,
          title: t(kind.labelKey),
          description: t(kind.descriptionKey),
          prompt: kind.fallbackPrompt,
          apply_default: false,
        }))

      const built = await chatApi.buildContext({
        notebook_id: notebookId,
        context_config: toContextConfig(context),
      })

      const focusText = focus?.trim()
      const input_text = focusText
        ? `${JSON.stringify(built.context, null, 2)}\n\nFocus: ${focusText}`
        : JSON.stringify(built.context, null, 2)

      const result = await transformationsApi.execute({
        transformation_id: transformation.id,
        input_text,
      })

      return notesApi.create({
        title: title?.trim() || t('studio.untitled'),
        content: result.output,
        note_type: 'ai',
        notebook_id: notebookId,
      })
    },
    onSuccess: (_note, { notebookId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notes(notebookId) })
      toast({
        title: t('studio.created'),
        description: t('studio.createdDesc'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('studio.failed')),
        variant: 'destructive',
      })
    },
  })
}
