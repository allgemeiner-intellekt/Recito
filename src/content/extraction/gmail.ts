import type { ContentScope } from '@shared/types';

export function isGmail(): boolean {
  return window.location.hostname === 'mail.google.com';
}

export function extractGmail(): ContentScope | null {
  if (!isGmail()) return null;

  // Primary selector: expanded email body
  const emailBody =
    document.querySelector<HTMLElement>('.a3s.aiL') ??
    document.querySelector<HTMLElement>('.ii.gt');

  if (!emailBody) return null;

  if (!emailBody.innerText.trim()) return null;

  // Try to get the subject line
  const subjectEl = document.querySelector<HTMLElement>('h2[data-thread-perm-id]');
  const title = subjectEl?.innerText.trim() ?? document.title;

  return {
    title,
    include: (node) => emailBody.contains(node),
    sourceElement: emailBody,
  };
}
