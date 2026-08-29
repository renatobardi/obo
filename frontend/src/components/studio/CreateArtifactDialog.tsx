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
import { ARTIFACT_KINDS, type TransformationStudioKind } from '@/lib/studio/kinds'
import type { ContextSelections } from '@/lib/types/notebook-context'

interface CreateArtifactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notebookId: string
  kind: TransformationStudioKind
  onKindChange: (kind: TransformationStudioKind) => void
  context: ContextSelections
}

export function CreateArtifactDialog({
  open,
  onOpenChange,
  notebookId,
  kind,
  onKindChange,
  context,
}: CreateArtifactDialogProps) {
  const { t } = useTranslation()
  const run = useRunStudioKind()

  // Chips only swap the kind; the fields the user already filled stay put.
  const [title, setTitle] = useState('')
  const [focus, setFocus] = useState('')

  useEffect(() => {
    if (!open) {
      setTitle('')
      setFocus('')
    }
  }, [open])

  const { sourceCount, noteCount } = useMemo(
    () => ({
      sourceCount: Object.values(context.sources).filter((m) => m !== 'off').length,
      noteCount: Object.values(context.notes).filter((m) => m !== 'off').length,
    }),
    [context],
  )
  const contextEmpty = sourceCount + noteCount === 0

  const handleGenerate = async () => {
    try {
      await run.mutateAsync({ kind, notebookId, title, focus, context })
      onOpenChange(false)
    } catch {
      // useRunStudioKind already surfaces the error toast; keep the dialog open.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(kind.labelKey)}</DialogTitle>
          <DialogDescription>{t('studio.createDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {ARTIFACT_KINDS.map((option) => {
            const Icon = option.icon
            const selected = option.id === kind.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onKindChange(option)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                  selected
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(option.labelKey)}
              </button>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground">{t(kind.descriptionKey)}</p>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-testid="studio-context-summary">
          <p>{t('studio.contextSummary', { sources: sourceCount, notes: noteCount })}</p>
          <p>{t('studio.fromSources')}</p>
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
