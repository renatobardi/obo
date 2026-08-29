'use client'

import { useMemo, useState } from 'react'
import { Bot } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useNotes } from '@/lib/hooks/use-notes'
import { GeneratePodcastDialog } from '@/components/podcasts/GeneratePodcastDialog'
import { STUDIO_KINDS, type StudioKind } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'
import { CreateArtifactDialog } from './CreateArtifactDialog'

interface StudioPanelProps {
  notebookId: string
  context: ContextSelections
}

export function StudioPanel({ notebookId, context }: StudioPanelProps) {
  const { t } = useTranslation()
  const { data: notes } = useNotes(notebookId)

  const [podcastOpen, setPodcastOpen] = useState(false)
  const [artifactKind, setArtifactKind] = useState<StudioKind | null>(null)

  const aiNotes = useMemo(() => (notes ?? []).filter((n) => n.note_type === 'ai'), [notes])

  return (
    <Card className="h-full flex flex-col flex-1 overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-border" />
          {t('navigation.studio')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto min-h-0 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {STUDIO_KINDS.map((kind) => {
            const Icon = kind.icon
            return (
              <button
                key={kind.id}
                type="button"
                onClick={() => (kind.id === 'podcast' ? setPodcastOpen(true) : setArtifactKind(kind))}
                className="flex flex-col gap-1.5 rounded-md border bg-card p-3 text-left card-hover"
              >
                <Icon className="h-4 w-4 text-teal" />
                <span className="text-sm font-medium">{t(kind.labelKey)}</span>
                <span className="text-xs text-muted-foreground line-clamp-2">{t(kind.descriptionKey)}</span>
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            {t('studio.generated')}
          </h4>
          {aiNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('studio.emptyHint')}</p>
          ) : (
            <div className="space-y-2">
              {aiNotes.map((note) => (
                <div key={note.id} className="flex items-start gap-2 rounded-md border bg-card p-3">
                  <Bot className="h-4 w-4 flex-shrink-0 text-teal" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{note.title || t('studio.untitled')}</p>
                    {note.content && (
                      <p className="line-clamp-2 text-xs text-muted-foreground break-all">{note.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <GeneratePodcastDialog open={podcastOpen} onOpenChange={setPodcastOpen} />
      {artifactKind && (
        <CreateArtifactDialog
          open
          onOpenChange={(o) => {
            if (!o) setArtifactKind(null)
          }}
          notebookId={notebookId}
          kind={artifactKind}
          context={context}
        />
      )}
    </Card>
  )
}
