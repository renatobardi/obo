import {
  CalendarClock,
  ClipboardList,
  FileText,
  GraduationCap,
  HelpCircle,
  Layers,
  Network,
  Podcast,
  type LucideIcon,
} from 'lucide-react'

export type StudioKindId =
  | 'mindmap'
  | 'report'
  | 'briefing'
  | 'faq'
  | 'timeline'
  | 'flashcards'
  | 'quiz'
  | 'podcast'

interface BaseStudioKind {
  id: StudioKindId
  labelKey: string
  descriptionKey: string
  icon: LucideIcon
}

/**
 * A Studio output that runs through the shared transformations engine: we look
 * up `transformationName`, creating it from `fallbackPrompt` on first use, then
 * execute it against the notebook context.
 */
export interface TransformationStudioKind extends BaseStudioKind {
  engine: 'transformation'
  transformationName: string
  fallbackPrompt: string
}

/** Podcast has its own generation pipeline (GeneratePodcastDialog). */
export interface PodcastStudioKind extends BaseStudioKind {
  id: 'podcast'
  engine: 'podcast'
}

export type StudioKind = TransformationStudioKind | PodcastStudioKind

export const STUDIO_KINDS: StudioKind[] = [
  {
    id: 'mindmap',
    engine: 'transformation',
    labelKey: 'studio.kindMindmap',
    descriptionKey: 'studio.kindMindmapDesc',
    icon: Network,
    transformationName: 'studio_mindmap',
    fallbackPrompt:
      'Build a hierarchical mind map of the material below. Start from a single central topic, then break it into main branches and sub-branches. Use nested Markdown bullet lists so the hierarchy is explicit. Keep each node short.',
  },
  {
    id: 'report',
    engine: 'transformation',
    labelKey: 'studio.kindReport',
    descriptionKey: 'studio.kindReportDesc',
    icon: FileText,
    transformationName: 'studio_report',
    fallbackPrompt:
      'Write a structured report on the material below. Include a short introduction, thematic sections with descriptive headings, and a conclusion. Be thorough and cite specifics from the sources. Use Markdown.',
  },
  {
    id: 'briefing',
    engine: 'transformation',
    labelKey: 'studio.kindBriefing',
    descriptionKey: 'studio.kindBriefingDesc',
    icon: ClipboardList,
    transformationName: 'studio_briefing',
    fallbackPrompt:
      'Produce a concise executive briefing on the material below. Lead with a one-paragraph summary, then a bulleted list of the essential takeaways, key facts, and any open questions. Keep it under one page.',
  },
  {
    id: 'faq',
    engine: 'transformation',
    labelKey: 'studio.kindFaq',
    descriptionKey: 'studio.kindFaqDesc',
    icon: HelpCircle,
    transformationName: 'studio_faq',
    fallbackPrompt:
      'Generate a FAQ from the material below. Anticipate the questions a reader would most likely ask and answer each one directly from the sources. Format as "**Q:** ...\\n\\n**A:** ..." pairs.',
  },
  {
    id: 'timeline',
    engine: 'transformation',
    labelKey: 'studio.kindTimeline',
    descriptionKey: 'studio.kindTimelineDesc',
    icon: CalendarClock,
    transformationName: 'studio_timeline',
    fallbackPrompt:
      'Extract every dated or sequential event from the material below and lay them out as a chronological timeline. Use a Markdown list of "**<date or step>** — <what happened>" entries in order. Note where dates are approximate or missing.',
  },
  {
    id: 'flashcards',
    engine: 'transformation',
    labelKey: 'studio.kindFlashcards',
    descriptionKey: 'studio.kindFlashcardsDesc',
    icon: Layers,
    transformationName: 'studio_flashcards',
    fallbackPrompt:
      'Create a set of active-recall flashcards from the material below. Each card is a "**Front:** <question or prompt>" line followed by a "**Back:** <answer>" line. Cover the most important facts and concepts; aim for 10–20 cards.',
  },
  {
    id: 'quiz',
    engine: 'transformation',
    labelKey: 'studio.kindQuiz',
    descriptionKey: 'studio.kindQuizDesc',
    icon: GraduationCap,
    transformationName: 'studio_quiz',
    fallbackPrompt:
      'Write a short multiple-choice quiz (about 8 questions) on the material below. For each question give four options labelled A–D, then list the correct answers with a one-line explanation in an answer key at the end.',
  },
  {
    id: 'podcast',
    engine: 'podcast',
    labelKey: 'studio.kindPodcast',
    descriptionKey: 'studio.kindPodcastDesc',
    icon: Podcast,
  },
]

/** The kinds handled by CreateArtifactDialog / useRunStudioKind. */
export const ARTIFACT_KINDS: TransformationStudioKind[] = STUDIO_KINDS.filter(
  (kind): kind is TransformationStudioKind => kind.engine === 'transformation',
)
