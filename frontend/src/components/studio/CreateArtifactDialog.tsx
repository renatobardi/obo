'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useRunStudioKind } from '@/lib/hooks/use-studio'
import { STUDIO_KINDS, type StudioKind } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'

interface CreateArtifactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notebookId: string
  kind: StudioKind
  context: ContextSelections
}

// Every kind except podcast, which has its own dialog.
const ARTIFACT_KINDS = STUDIO_KINDS.filter((k) => k.id !== 'podcast')

export function CreateArtifactDialog({ open, onOpenChange, notebookId, kind, context }: CreateArtifactDialogProps) {
  const { t } = useTranslation()
  const run = useRunStudioKind()

  const [activeId, setActiveId] = useState(kind.id)
  const [title, setTitle] = useState('')
  const [focus, setFocus] = useState('')

  // Chips only swap the kind; the fields the user already filled stay put.
  useEffect(() => {
    if (open) setActiveId(kind.id)
  }, [open, kind.id])

  useEffect(() => {
    if (!open) {
      setTitle('')
      setFocus('')
    }
  }, [open])

  const active = ARTIFACT_KINDS.find((k) => k.id === activeId) ?? ARTIFACT_KINDS[0]

  const { sourceCount, noteCount } = useMemo(() => {
    return {
      sourceCount: Object.values(context.sources).filter((m) => m !== 'off').length,
      noteCount: Object.values(context.notes).filter((m) => m !== 'off').length,
    }
  }, [context])
  const contextEmpty = sourceCount + noteCount === 0

  const handleGenerate = async () => {
    try {
      await run.mutateAsync({ kind: active, notebookId, title, focus, context })
      onOpenChange(false)
    } catch {
      // useRunStudioKind already surfaces the error toast; keep the dialog open.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(active.labelKey)}</DialogTitle>
          <DialogDescription>{t('studio.createDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {ARTIFACT_KINDS.map((k) => {
            const Icon = k.icon
            const selected = k.id === active.id
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setActiveId(k.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                  selected
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(k.labelKey)}
              </button>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground">{t(active.descriptionKey)}</p>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-testid="studio-context-summary">
          <span>{t('studio.contextSummary', { sources: sourceCount, notes: noteCount })}</span>
          <span className="mx-1.5">·</span>
          <span>{t('studio.fromSources')}</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="studio-title">{t('studio.titleLabel')}</Label>
          <Input
            id="studio-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="studio-focus">{t('studio.focusLabel')}</Label>
          <Textarea
            id="studio-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={t('studio.focusPlaceholder')}
            className="min-h-[80px] text-sm"
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleGenerate} disabled={run.isPending || contextEmpty}>
            {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('studio.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
