import { afterEach, expect, test } from 'bun:test'
import { AI_BATCH_SIZE, completeQuestionsWithOpenRouter, type AIQuestion } from '../src/lib/openrouter'
import { EMPTY_STORE } from '../src/lib/types'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const questions = (count: number): AIQuestion[] => Array.from({ length: count }, (_, index) => ({
  uid: `field-${index}`, question: `Question ${index}?`, options: [],
}))
const run = (input: AIQuestion[], onProgress?: Parameters<typeof completeQuestionsWithOpenRouter>[0]['onProgress']) => completeQuestionsWithOpenRouter({
  key: 'test-key', model: 'test-model', questions: input, store: EMPTY_STORE, pageTitle: 'Test job', onProgress,
})
const response = (content: unknown, finish_reason = 'stop') => new Response(JSON.stringify({
  choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason }],
}))

test('batches questions, maps reordered answers by ID, and reports progress', async () => {
  const requests: any[] = []
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(init!.body as string)
    requests.push(body)
    const input = JSON.parse(body.messages[1].content)
    return response({ answers: input.questions.toReversed().map((q: any) => ({ id: q.id, answer: `Answer ${q.id}` })) })
  }) as typeof fetch
  const progress: number[] = []
  const result = await run(questions(AI_BATCH_SIZE + 2), (completed) => progress.push(completed))
  expect(requests).toHaveLength(2)
  expect(requests[0].response_format).toEqual({ type: 'json_object' })
  expect(JSON.parse(requests[0].messages[1].content).questions).toHaveLength(AI_BATCH_SIZE)
  expect(result.map((r) => r.value)).toEqual(questions(AI_BATCH_SIZE + 2).map((q) => `Answer ${q.uid}`))
  expect(progress).toEqual([AI_BATCH_SIZE, AI_BATCH_SIZE + 2])
})

test('isolates omitted, duplicate, invalid-option and unsupported answers', async () => {
  globalThis.fetch = (async () => response({ answers: [
    { id: 'field-0', answer: 'Correct' },
    { id: 'field-1', answer: 'First' }, { id: 'field-1', answer: 'Second' },
    { id: 'field-3', answer: 'Maybe' },
    { id: 'field-4', answer: null },
    { id: 'field-5', answer: 42 },
    { id: 'field-6', answer: '   ' },
    { id: 'foreign-id', answer: 'Must not be applied' },
  ] })) as typeof fetch
  const input = questions(7)
  input[3].options = ['Yes', 'No']
  const result = await run(input)
  expect(result[0].value).toBe('Correct')
  expect(result[1].error).toContain('duplicate')
  expect(result[2].error).toContain('omitted')
  expect(result[3].error).toContain('option')
  expect(result[4].skipped).toContain('enough information')
  expect(result[5].error).toContain('invalid')
  expect(result[6].error).toContain('empty')
  expect(result).toHaveLength(7)
})

test('rejects malformed and truncated batches without inserting raw JSON', async () => {
  for (const reply of [response('{bad json'), response({ answers: [] }, 'length'), response({ other: [] }), response(null)]) {
    globalThis.fetch = (async () => reply) as typeof fetch
    const result = await run(questions(2))
    expect(result.every((r) => r.error && !r.value)).toBe(true)
  }
})

test('continues subsequent batches when one request fails', async () => {
  let requests = 0
  globalThis.fetch = (async (_url, init) => {
    if (++requests === 1) return new Response('Unavailable', { status: 503 })
    const input = JSON.parse(JSON.parse(init!.body as string).messages[1].content)
    return response({ answers: input.questions.map((q: any) => ({ id: q.id, answer: 'Good' })) })
  }) as typeof fetch
  const result = await run(questions(AI_BATCH_SIZE + 1))
  expect(result.slice(0, AI_BATCH_SIZE).every((r) => r.error?.includes('503'))).toBe(true)
  expect(result[AI_BATCH_SIZE].value).toBe('Good')
})

test('does not request AI for an empty queue, and validates configuration and IDs', async () => {
  let called = false
  globalThis.fetch = (async () => { called = true; throw new Error('Unexpected request') }) as typeof fetch
  expect(await run([])).toEqual([])
  await expect(run([questions(1)[0], questions(1)[0]])).rejects.toThrow('unique')
  await expect(completeQuestionsWithOpenRouter({ key: '', model: 'test', questions: questions(1), store: EMPTY_STORE, pageTitle: '' })).rejects.toThrow('key')
  expect(called).toBe(false)
})
