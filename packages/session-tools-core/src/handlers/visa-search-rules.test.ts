import { describe, test, expect } from 'bun:test'
import { handleVisaSearchRules } from './visa-search-rules'
import { VISA_KB_SEED } from './visa-kb-seed'
import type { SessionToolContext } from '../context'

const fakeCtx = {
  sessionId: 'test',
  workspacePath: '/tmp/does-not-exist',
  get sourcesPath() { return '' },
  get skillsPath() { return '' },
  plansFolderPath: '',
  callbacks: {} as any,
  fs: {
    exists: () => false,
    readFile: () => { throw new Error('no') },
    readFileBuffer: () => Buffer.alloc(0),
    writeFile: () => {},
    isDirectory: () => false,
    readdir: () => [],
    stat: () => ({ size: 0, isDirectory: () => false }),
  },
} as unknown as SessionToolContext

describe('visa_search_rules', () => {
  test('seed corpus loads with expected docs', () => {
    expect(VISA_KB_SEED.length).toBeGreaterThanOrEqual(10)
  })

  test('Chinese query finds US B-1/B-2 checklist doc', async () => {
    const r = await handleVisaSearchRules(fakeCtx, { query: '商务签证 需要哪些材料 邀请函', destination: 'US' })
    expect(r.isError).toBeFalsy()
    const results = r.structuredContent!.results as any[]
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('us-b1b2-docs')
    expect(results[0].source).toBe('travel.state.gov')
    expect(results[0].score).toBeGreaterThan(0.3)
  })

  test('metadata filter excludes other destinations', async () => {
    const r = await handleVisaSearchRules(fakeCtx, { query: '材料', destination: 'JP', limit: 3 })
    const results = r.structuredContent!.results as any[]
    expect(results.every(x => ['JP', '*'].includes((x as any).destination) || x.id.startsWith('jp') || x.id.startsWith('generic'))).toBe(true)
  })

  test('conflict guidance doc retrievable for cross-document query', async () => {
    const r = await handleVisaSearchRules(fakeCtx, { query: '跨文件字段冲突怎么处理' })
    const results = r.structuredContent!.results as any[]
    expect(results.some(x => x.id === 'generic-conflict')).toBe(true)
  })

  test('empty args error', async () => {
    const r = await handleVisaSearchRules(fakeCtx, { query: '' })
    expect(r.isError).toBe(true)
  })
})
