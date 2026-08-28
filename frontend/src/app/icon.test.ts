import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('app icon', () => {
  it('uses the Obo sakura mark', () => {
    const icon = readFileSync(resolve(process.cwd(), 'src/app/icon.svg'), 'utf8')

    expect(icon.match(/M50,50 C38,43 33,27 39,15/g)).toHaveLength(5)
  })
})
