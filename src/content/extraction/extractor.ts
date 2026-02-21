import type { ExtractedContent, TextBlock } from './types'
import type { SiteType } from '../../shared/types'
import { extractGeneric } from './generic-extractor'
import { extractGmail } from './gmail-extractor'
import { extractGDocs } from './gdocs-extractor'

function detectSiteType(): SiteType {
  const hostname = window.location.hostname
  if (hostname === 'mail.google.com') return 'gmail'
  if (hostname === 'docs.google.com' && window.location.pathname.startsWith('/document/')) return 'gdocs'
  return 'generic'
}

export async function extractContent(): Promise<ExtractedContent> {
  const siteType = detectSiteType()
  switch (siteType) {
    case 'gmail':
      return extractGmail()
    case 'gdocs':
      return extractGDocs()
    default:
      return extractGeneric()
  }
}

export function blocksToFullText(blocks: TextBlock[]): { fullText: string; totalChars: number } {
  const parts: string[] = []
  let totalChars = 0
  for (const block of blocks) {
    const text = block.nodes.map((n) => n.text).join('')
    const trimmed = text.trim()
    if (!trimmed) continue
    parts.push(trimmed)
    totalChars += trimmed.length
  }
  const fullText = parts.join('\n\n')
  return { fullText, totalChars: fullText.length }
}

