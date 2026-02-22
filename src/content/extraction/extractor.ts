import type { ExtractionResult } from '@shared/types';
import { extractGeneric } from './generic';
import { extractGmail } from './gmail';

export function isGmail(): boolean {
  return window.location.hostname === 'mail.google.com';
}

export function extractContent(): ExtractionResult | null {
  try {
    if (isGmail()) {
      return extractGmail();
    }
    return extractGeneric();
  } catch (err) {
    console.error('Immersive Reader: extraction failed', err);
    return null;
  }
}
