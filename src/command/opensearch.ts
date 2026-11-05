/** OpenSearch's format: [query, [suggestion, …], …]. */
export function parseSuggestions(json: string): string[] {
  try {
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return data[1].filter((item): item is string => typeof item === 'string' && !!item.trim());
  } catch {
    return [];
  }
}
