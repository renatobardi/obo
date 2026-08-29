import { redirect } from 'next/navigation'

// Advanced now lives under /settings; keep the old URL working for existing
// links and bookmarks.
export default function AdvancedRedirect() {
  redirect('/settings/advanced')
}
