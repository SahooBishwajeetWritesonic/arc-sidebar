// Endings that make a dotted word an address ("arc.net") rather than words ("node.js").
// Country codes are listed separately; these are the common others.
const GENERIC_TLDS = new Set(
  (
    'com org net edu gov mil int info biz name pro mobi aero coop museum xyz ' +
    'io dev app ai page site online tech store shop blog cloud link live news ' +
    'design studio agency digital media email global group house land life ' +
    'network one plus run social space team today tools top work world zone ' +
    'art bio fun moe wiki chat club inc ltd mba new guru ninja rocks fyi lol'
  ).split(' '),
);

// ISO 3166 country domains. As in Chrome, "readme.md" is an address (Moldova)
// while "node.js" stays a search.
const COUNTRY_TLDS = new Set(
  (
    'ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br ' +
    'bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ' +
    'ec ee eg er es et eu fi fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw ' +
    'gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ' +
    'ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu ' +
    'mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt ' +
    'pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st sv sx sy sz tc td ' +
    'tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye ' +
    'yt za zm zw'
  ).split(' '),
);

/** Schemes the bar opens as typed. Others ("javascript:") are searched for instead. */
const SCHEMES = new Set(['http:', 'https:', 'file:', 'chrome:', 'about:', 'view-source:']);

const HOST = /^([a-z0-9-]+\.)+([a-z]{2,63})$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * The URL to open for `input`, or null for a search. Bare addresses get https://,
 * but localhost and IPs get http:// (local servers rarely have certificates).
 */
export function typedUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;

  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(text)?.[1]?.toLowerCase();
  if (scheme && SCHEMES.has(scheme) && (scheme.length > 5 || text.includes('//'))) {
    return parses(text) ? text : null;
  }

  // ":5173" is localhost.
  if (/^:\d{1,5}([/?#].*)?$/.test(text)) {
    return parses(`http://localhost${text}`) ? `http://localhost${text}` : null;
  }

  // host[:port][/path][?query][#hash]
  const match = /^([^/?#:]+)(:\d{1,5})?([/?#].*)?$/.exec(text);
  if (!match) return null;
  const host = match[1]!.toLowerCase();
  const local = host === 'localhost' || host.endsWith('.localhost') || IPV4.test(host);
  if (local) return parses(`http://${text}`) ? `http://${text}` : null;

  const tld = HOST.exec(host)?.[2]?.toLowerCase();
  if (!tld) return null;
  // With a port or path, any letters after the last dot will do.
  const known = GENERIC_TLDS.has(tld) || COUNTRY_TLDS.has(tld);
  if (!known && !match[2] && !match[3]) return null;
  return parses(`https://${text}`) ? `https://${text}` : null;
}

function parses(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** A URL as people type it: no scheme, no "www.", no trailing slash on a bare host. */
export function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^([^/?#]+)\/$/, '$1');
}
