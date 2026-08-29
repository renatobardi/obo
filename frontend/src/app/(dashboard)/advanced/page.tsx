import { redirect } from 'next/navigation'

// Moved under /settings (PR 2). Keep the old path working.
export default function AdvancedRedirect() {
  redirect('/settings/advanced')
}
