'use client'

import { useState } from 'react'
import { Upload, FileUp, Link as LinkIcon, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { AddExistingSourceDialog } from '@/components/sources/AddExistingSourceDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

interface NotebookEmptyStateProps {
  notebookId: string
  onSourceAdded?: () => void
}

export function NotebookEmptyState({ notebookId, onSourceAdded }: NotebookEmptyStateProps) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [addExistingOpen, setAddExistingOpen] = useState(false)

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">{t('notebooks.emptyTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notebooks.emptyDesc')}</p>

        <div className="mt-8 rounded-lg border-2 border-dashed border-border p-8">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">{t('sources.dropFilesHere')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('sources.supportedFormats')}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => setAddOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" />
              {t('sources.chooseFiles')}
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <LinkIcon className="mr-2 h-4 w-4" />
              {t('sources.pasteLink')}
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <PencilLine className="mr-2 h-4 w-4" />
              {t('sources.writeText')}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAddExistingOpen(true)}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t('sources.addExisting')}
        </button>
      </div>

      <AddSourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultNotebookId={notebookId}
      />
      <AddExistingSourceDialog
        open={addExistingOpen}
        onOpenChange={setAddExistingOpen}
        notebookId={notebookId}
        onSuccess={onSourceAdded}
      />
    </div>
  )
}
