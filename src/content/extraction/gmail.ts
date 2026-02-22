import type { ExtractionResult } from '@shared/types';

export function extractGmail(): ExtractionResult | null {
  // Try expanded email body first, then fallback
  const emailBody =
    document.querySelector('div.a3s.aiL') ??
    document.querySelector('div.a3s');

  if (!emailBody) return null;

  const text = emailBody.textContent?.trim() ?? '';
  if (!text) return null;

  // Get subject line
  const subject = document.querySelector('h2.hP')?.textContent ?? document.title;

  return {
    title: subject,
    html: emailBody.innerHTML,
    textContent: text,
    wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
    sourceElement: emailBody,
  };
}
