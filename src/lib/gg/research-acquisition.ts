export function acquisitionFailed(source: string, error: string, attemptCount: number) {
  return {
    status: "ACQUISITION_FAILED" as const,
    source,
    error: error.slice(0, 240),
    timestamp: new Date().toISOString(),
    retry_after: null,
    attempt_count: attemptCount,
    content: null,
  };
}
