import { profileContext } from './match'
import type { Store } from './types'

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export async function completeWithOpenRouter(opts: {
  key: string
  model: string
  question: string
  options: string[]
  store: Store
  pageTitle: string
}): Promise<string> {
  if (!opts.key) throw new Error('Add an OpenRouter key in Settings.')
  const system = `You fill job application questions as the candidate. Use only the dossier. Be specific, first person, no markdown, no preamble. If options are provided, reply with the exact option text. Keep answers under 180 words unless the question is a cover letter (then under 350).`
  const user = [
    `Application: ${opts.pageTitle}`,
    `Dossier:\n${profileContext(opts.store)}`,
    opts.options.length ? `Options:\n${opts.options.map((o) => `- ${o}`).join('\n')}` : '',
    `Question: ${opts.question}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://carbon',
      'X-Title': 'Carbon',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 700,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 180)}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenRouter returned an empty answer.')
  return text.replace(/^["']|["']$/g, '')
}

export async function structureResumeWithAI(opts: {
  key: string
  model: string
  text: string
}): Promise<unknown> {
  if (!opts.key) throw new Error('Add an OpenRouter key in Settings.')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://carbon',
      'X-Title': 'Carbon',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        {
          role: 'system',
          content:
            'Extract a job-seeker dossier as JSON with keys identity (firstName,lastName,email,phone,city,state,country,linkedin,github,website,headline,summary), experience[{company,title,location,startDate,endDate,current,description}], education[{school,degree,field,startDate,endDate,gpa}], skills[string]. Dates like "Jan 2022". No markdown.',
        },
        { role: 'user', content: opts.text.slice(0, 12000) },
      ],
      temperature: 0,
      max_tokens: 2000,
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content ?? '{}'
  const trimmed = raw.replace(/^```json\s*|\s*```$/g, '')
  return JSON.parse(trimmed)
}

export interface ModelPricing {
  id: string
  name: string
  prompt: string
  completion: string
}

const pricingCache = new Map<string, ModelPricing | null>()

function perMillion(perToken: string): number {
  return Number(perToken) * 1e6
}

export function formatUsdPerM(perToken: string): string {
  const n = perMillion(perToken)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return 'free'
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
}

export function formatModelCost(p: ModelPricing): string {
  return `${formatUsdPerM(p.prompt)} in · ${formatUsdPerM(p.completion)} out / 1M tok`
}

export function formatUsdShort(p: ModelPricing): string {
  return `${formatUsdPerM(p.prompt)}/${formatUsdPerM(p.completion)}`
}

export async function fetchModelPricing(id: string): Promise<ModelPricing | null> {
  const key = id.trim()
  if (!key) return null
  if (pricingCache.has(key)) return pricingCache.get(key) ?? null
  const res = await fetch(
    `https://openrouter.ai/api/v1/models?q=${encodeURIComponent(key)}`,
  )
  if (!res.ok) {
    pricingCache.set(key, null)
    return null
  }
  const json = (await res.json()) as {
    data?: Array<{
      id: string
      name?: string
      pricing?: { prompt?: string; completion?: string }
    }>
  }
  const models = json.data ?? []
  const hit = models.find((m) => m.id === key)
  const pricing =
    hit?.pricing?.prompt != null && hit.pricing.completion != null
      ? {
          id: hit.id,
          name: hit.name ?? hit.id,
          prompt: hit.pricing.prompt,
          completion: hit.pricing.completion,
        }
      : null
  if (pricing) pricingCache.set(key, pricing)
  return pricing
}
