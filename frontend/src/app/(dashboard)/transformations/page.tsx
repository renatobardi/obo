import { redirect } from 'next/navigation'

// Transformations now lives under /settings; keep the old URL working for
// existing links and bookmarks.
export default function TransformationsRedirect() {
  redirect('/settings/transformations')
}
