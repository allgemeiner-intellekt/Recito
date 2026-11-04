// Keep stored configs readable even when their dedicated adapter is no longer supported.
export function isSupportedProvider(providerId: string): boolean {
  return providerId === 'mimo' || providerId === 'openai' || providerId === 'custom';
}
