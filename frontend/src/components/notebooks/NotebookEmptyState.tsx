'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { AddExistingSourceDialog } from '@/components/sources/AddExistingSourceDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

type SourceType = 'link' | 'upload' | 'text'

interface NotebookEmptyStateProps {
  notebookId: string
}

export function NotebookEmptyState({ notebookId }: NotebookEmptyStateProps) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [addExistingOpen, setAddExistingOpen] = useState(false)
  const [dialogType, setDialogType] = useState<SourceType>('upload')
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  const openAdd = (type: SourceType, files: File[] = []) => {
    setDroppedFiles(files)
    setDialogType(type)
    setAddOpen(true)
  }

  const handleAddOpenChange = (open: boolean) => {
    setAddOpen(open)
    if (!open) setDroppedFiles([])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    openAdd('upload', files)
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">{t('notebooks.emptyTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notebooks.emptyDesc')}</p>

        <div
          data-testid="notebook-empty-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="mt-8 rounded-lg border-2 border-dashed border-border p-8"
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">{t('sources.dropFilesHere')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('sources.supportedFormats')}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => openAdd('upload')}>{t('sources.chooseFiles')}</Button>
            <Button variant="outline" onClick={() => openAdd('link')}>
              {t('sources.pasteLink')}
            </Button>
            <Button variant="outline" onClick={() => openAdd('text')}>
              {t('sources.writeText')}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAddExistingOpen(true)}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t('sources.reuseFromOtherNotebook')}
        </button>
      </div>

      <AddSourceDialog
        open={addOpen}
        onOpenChange={handleAddOpenChange}
        defaultNotebookId={notebookId}
        defaultType={dialogType}
        initialFiles={droppedFiles}
      />
      <AddExistingSourceDialog
        open={addExistingOpen}
        onOpenChange={setAddExistingOpen}
        notebookId={notebookId}
      />
    </div>
  )
}
