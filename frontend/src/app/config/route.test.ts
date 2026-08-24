import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

/**
 * `/config` must never build the client's API URL from request headers
 * (Host, X-Forwarded-Proto): those are client-controlled, and behind a
 * reverse proxy that forwards them untrusted, using them to construct a URL
 * the client will then fetch (with its auth bearer token - see
 * lib/api/client.ts) is a redirect-to-attacker-host risk. It's also just
 * wrong for the documented single-exposed-port reverse-proxy deployment
 * shape, where guessing `<host>:5055` points at a port nothing is listening
 * on externally. Same-origin (empty string) is the only safe default.
 */
describe('GET /config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.API_URL
    delete process.env.NEXT_PUBLIC_API_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('uses API_URL env var when explicitly set', async () => {
    process.env.API_URL = 'https://configured.example.com'

    const response = await GET()
    const body = await response.json()

    expect(body.apiUrl).toBe('https://configured.example.com')
  })

  it('falls back to NEXT_PUBLIC_API_URL when API_URL is unset', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://public-configured.example.com'

    const response = await GET()
    const body = await response.json()

    expect(body.apiUrl).toBe('https://public-configured.example.com')
  })

  it('prefers API_URL over NEXT_PUBLIC_API_URL when both are set', async () => {
    process.env.API_URL = 'https://configured.example.com'
    process.env.NEXT_PUBLIC_API_URL = 'https://public-configured.example.com'

    const response = await GET()
    const body = await response.json()

    expect(body.apiUrl).toBe('https://configured.example.com')
  })

  it('defaults to same-origin (empty string) when neither is set', async () => {
    const response = await GET()
    const body = await response.json()

    expect(body.apiUrl).toBe('')
  })
})
