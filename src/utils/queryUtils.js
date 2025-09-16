export function extractQueryFromLink(link) {
  try {
    const u = new URL(link);
    const q = u.searchParams.get('query') || '';
    return decodeURIComponent(q);
  } catch {
    return '';
  }
}

export function withErrorFilter(query) {
  const lower = query.toLowerCase();
  const hasStatus =
    lower.includes('status:error') ||
    lower.includes('status:critical') ||
    lower.includes('status:warn') ||
    lower.includes('status:info') ||
    lower.includes('@status:') ||
    lower.includes('status:');

  if (hasStatus) return query;
  // Default: only errors/critical
  return `(${query}) AND (status:error OR status:critical)`;
}

export function pickLogFields(logData) {
  const attrs = logData?.attributes || {};
  const tags = attrs?.tags || [];
  return {
    timestamp: attrs?.timestamp,
    status: attrs?.status,
    service: attrs?.service,
    host: attrs?.host,
    message: attrs?.message,
    ddsource: attrs?.attributes?.ddsource || attrs?.ddsource,
    tags,
  };
}
