export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerId: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(status: number, body: string, providerId: string): ApiError {
    const retryable = status === 429 || status === 403 || status >= 500;
    return new ApiError(body || `HTTP ${status}`, status, providerId, retryable);
  }

  static fromNetworkError(err: unknown, providerId: string): ApiError {
    const message = err instanceof Error ? err.message : String(err);
    return new ApiError(`Network error: ${message}`, 0, providerId, true);
  }
}
