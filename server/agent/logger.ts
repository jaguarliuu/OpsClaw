function formatDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return '';
  }

  return ` ${entries
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')}`;
}

export function logAgent(event: string, details: Record<string, unknown> = {}) {
  console.log(`[Agent] ${new Date().toISOString()} ${event}${formatDetails(details)}`);
}

export function logSession(event: string, details: Record<string, unknown> = {}) {
  console.log(`[Session] ${new Date().toISOString()} ${event}${formatDetails(details)}`);
}
