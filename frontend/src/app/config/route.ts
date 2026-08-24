import { NextResponse } from 'next/server'

/**
 * Runtime Configuration Endpoint
 *
 * This endpoint provides server-side environment variables to the client at runtime.
 * This solves the NEXT_PUBLIC_* limitation where variables are baked into the build.
 *
 * Environment Variables:
 * - API_URL: Where the browser/client should make API requests (public/external URL)
 * - INTERNAL_API_URL: Where Next.js server-side should proxy API requests (internal URL)
 *   Default: http://localhost:5055 (used by Next.js rewrites in next.config.ts)
 *
 * Why two different variables?
 * - API_URL: Used by browser clients, only needed when the API isn't reachable
 *   same-origin (e.g. a split frontend/backend deployment with CORS enabled).
 * - INTERNAL_API_URL: Used by Next.js rewrites for server-side proxying, typically http://localhost:5055
 *
 * When API_URL isn't set, this returns an empty string: the client then calls
 * `/api/*` same-origin, which next.config.ts's rewrite already forwards to
 * INTERNAL_API_URL server-side. That works for every deployment shape this
 * project documents (plain `docker compose up`, single-container, and a
 * single exposed port behind a reverse proxy) without needing to guess a
 * host/port from the request — there is deliberately no auto-detection here:
 * guessing `<host>:5055` broke behind a reverse proxy that only exposes the
 * frontend's port, and required trusting the client-controlled Host header
 * to build a URL the client would then fetch (see git history for the
 * validation that used to live here).
 */
export async function GET() {
  return NextResponse.json({
    apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '',
  })
}
