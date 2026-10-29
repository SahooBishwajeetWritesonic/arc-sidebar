/** Arc's Copy URL ("Super Copy"): links without tracking parameters, as URLs or Markdown. */

const TRACKING =
  /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|oly_anon_id|oly_enc_id|vero_id|ref_src)$/i;

/** The address without tracking parameters; anything else stays exactly as it was. */
export function cleanUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/^https?:$/.test(parsed.protocol)) return url;
  const params = [...parsed.searchParams];
  const kept = params.filter(([key]) => !TRACKING.test(key));
  if (kept.length === params.length) return url;
  parsed.search = new URLSearchParams(kept).toString();
  return parsed.href;
}

export interface Link {
  url: string;
  title: string;
}

export function linksText(links: readonly Link[], markdown = false): string {
  const lines = links.map(({ url, title }) => {
    const clean = cleanUrl(url);
    if (!markdown) return clean;
    const text = (title.trim() || clean).replace(/[[\]\\]/g, '\\$&');
    // Brackets and spaces would end the link early (encodeURIComponent leaves brackets).
    const target = clean.replace(
      /[()\s]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    );
    return `[${text}](${target})`;
  });
  return markdown && lines.length > 1
    ? lines.map((line) => `- ${line}`).join('\n')
    : lines.join('\n');
}

export function copiedText(count: number, markdown = false): string {
  const what = count === 1 ? 'URL' : `${count} URLs`;
  return markdown ? `Copied ${what} as Markdown` : `Copied ${what}`;
}
