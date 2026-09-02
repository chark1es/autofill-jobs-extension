import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import type { Education, Experience, Identity } from './types'
import { uid } from './storage'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/
const URL_RE = /https?:\/\/[^\s)]+/gi

export async function extractResumeText(file: File): Promise<string> {
  const mime = file.type
  const name = file.name.toLowerCase()
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buf }).promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
    }
    return pages.join('\n').replace(/\s+/g, ' ').trim()
  }
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const buf = await file.arrayBuffer()
    const res = await mammoth.extractRawText({ arrayBuffer: buf })
    return res.value.replace(/\s+/g, ' ').trim()
  }
  return (await file.text()).trim()
}

export function parseResumeHeuristics(text: string): {
  identity: Partial<Identity>
  experience: Experience[]
  education: Education[]
  skills: string[]
} {
  const email = text.match(EMAIL)?.[0] ?? ''
  const phone = text.match(PHONE)?.[0] ?? ''
  const urls = text.match(URL_RE) ?? []
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? ''
  const github = urls.find((u) => /github\.com/i.test(u)) ?? ''
  const website = urls.find((u) => !/linkedin|github/i.test(u)) ?? ''
  const firstLine = text.slice(0, 120).split(/email|phone|\d{3}/i)[0]?.trim() ?? ''
  const nameParts = firstLine.split(/\s+/).filter((w) => /^[A-Z][a-z.'-]+$/.test(w))
  const skillsBlock = sliceSection(text, /skills/i)
  const skills = skillsBlock
    ? skillsBlock.split(/[,•|·\n]/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 40).slice(0, 40)
    : []

  return {
    identity: {
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' '),
      email,
      phone,
      linkedin,
      github,
      website,
      summary: sliceSection(text, /summary|profile|about/i).slice(0, 1200),
    },
    experience: splitJobs(sliceSection(text, /experience|employment/i)),
    education: splitEdu(sliceSection(text, /education/i)),
    skills,
  }
}

function sliceSection(text: string, heading: RegExp): string {
  const re = new RegExp(`(?:^|\\n)\\s*(${heading.source})\\s*(?:\\n|:)`, 'i')
  const m = re.exec(text)
  if (!m || m.index === undefined) return ''
  const start = m.index + m[0].length
  const rest = text.slice(start)
  const next = rest.search(
    /\n\s*(experience|education|skills|projects|certifications|awards)\s*(?:\n|:)/i,
  )
  return (next >= 0 ? rest.slice(0, next) : rest).trim()
}

function splitJobs(block: string): Experience[] {
  if (!block) return []
  const chunks = block.split(/\s(?=[A-Z][a-zA-Z0-9 .,&-]{2,40}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}))/)
  return chunks.slice(0, 8).map((c) => {
    const date = c.match(
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present)/i,
    )
    return {
      id: uid('exp'),
      title: c.slice(0, 80).split(/[–—-]/)[0]?.trim() ?? '',
      company: '',
      location: '',
      startDate: date?.[1] ?? '',
      endDate: date?.[2] && !/present/i.test(date[2]) ? date[2] : '',
      current: /present/i.test(date?.[2] ?? ''),
      description: c.slice(0, 1000),
    }
  })
}

function splitEdu(block: string): Education[] {
  if (!block) return []
  return block
    .split(/\.(?=\s|[A-Z])/)
    .slice(0, 4)
    .map((c) => ({
      id: uid('edu'),
      school: c.slice(0, 80).trim(),
      degree: (c.match(/(Bachelor|Master|PhD|B\.?S\.?|M\.?S\.?|MBA)[^,]*/i)?.[0] ?? '').trim(),
      field: (c.match(/in\s+([^,]+)/i)?.[1] ?? '').trim(),
      location: '',
      startDate: '',
      endDate: c.match(/\d{4}/)?.[0] ?? '',
      gpa: c.match(/GPA[:\s]+([0-9.]+)/i)?.[1] ?? '',
    }))
    .filter((e) => e.school)
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const s = String(reader.result)
      resolve(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s)
    }
    reader.readAsDataURL(file)
  })
}
