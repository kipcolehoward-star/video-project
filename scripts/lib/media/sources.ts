/**
 * Image sources with clear licensing. Every candidate carries the
 * provider's own author/licence metadata — never inferred.
 *
 *   nasa     NASA Image and Video Library. No key. Generally not copyrighted;
 *            NASA media guidelines apply (credit NASA, no implied endorsement).
 *   commons  Wikimedia Commons. No key. Per-file licence; only PD / CC0 /
 *            CC BY / CC BY-SA are accepted. BY/BY-SA require attribution.
 *   pexels   Pexels. Free key (PEXELS_API_KEY). Pexels License: free
 *            commercial use, attribution appreciated not required.
 */
import {env} from '../env';

export interface Candidate {
  provider: 'nasa' | 'commons' | 'pexels';
  id: string;
  title: string;
  width?: number;
  height?: number;
  author: string;
  license: string;
  licenseUrl?: string;
  attributionRequired: boolean;
  /** Human page for the item (goes in assets.json `source`). */
  pageUrl: string;
  thumbUrl: string;
  /** Resolved lazily for NASA (needs a second request). */
  downloadUrl?: string;
  warning?: string;
}

const UA = 'video-project/0.1 (local video research tool; Node fetch)';

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {headers: {'User-Agent': UA, ...headers}});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

const stripHtml = (s: string | undefined) => {
  const t = (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // Commons often nests the same name twice ("Unknown authorUnknown author").
  const half = t.length / 2;
  return Number.isInteger(half) && t.slice(0, half) === t.slice(half) ? t.slice(0, half) : t;
};

// ---------------------------------------------------------------- NASA
export async function searchNasa(query: string, limit = 12): Promise<Candidate[]> {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=${limit}`;
  const data = await getJson(url);
  type Item = {data: {nasa_id: string; title: string; center?: string; photographer?: string; secondary_creator?: string}[]; links?: {href: string; rel?: string}[]};
  return (data.collection.items as Item[]).slice(0, limit).map((it) => {
    const d = it.data[0];
    return {
      provider: 'nasa' as const,
      id: d.nasa_id,
      title: d.title,
      author: d.photographer || d.secondary_creator || (d.center ? `NASA ${d.center}` : 'NASA'),
      license: 'NASA media (generally not copyrighted; NASA media usage guidelines apply)',
      licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      attributionRequired: false,
      pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      thumbUrl: it.links?.find((l) => l.rel === 'preview')?.href ?? it.links?.[0]?.href ?? '',
      warning: 'Check the item page: some NASA images include third-party or identifiable people.',
    };
  });
}

async function resolveNasaDownload(c: Candidate): Promise<string> {
  const data = await getJson(`https://images-api.nasa.gov/asset/${encodeURIComponent(c.id)}`);
  const hrefs = (data.collection.items as {href: string}[]).map((i) => i.href.replace(/^http:/, 'https:'));
  return hrefs.find((h) => /~orig\.(jpe?g|png|tif)$/i.test(h)) ?? hrefs.find((h) => /~large\.(jpe?g|png)$/i.test(h)) ?? hrefs[0];
}

// ---------------------------------------------------------------- Commons
const ACCEPTED_COMMONS = /^(cc0|public domain|pd|cc by(-sa)? ?\d|cc-by(-sa)?-\d)/i;

export async function searchCommons(query: string, limit = 12): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: String(Math.min(50, limit * 3)),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: '480',
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  type Page = {
    title: string;
    imageinfo?: {url: string; width: number; height: number; thumburl: string; descriptionurl: string; mime: string; extmetadata?: Record<string, {value: string}>}[];
  };
  const out: Candidate[] = [];
  for (const page of Object.values((data.query?.pages ?? {}) as Record<string, Page>)) {
    const ii = page.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime)) continue;
    const m = ii.extmetadata ?? {};
    const license = stripHtml(m.LicenseShortName?.value);
    if (!ACCEPTED_COMMONS.test(license)) continue;
    out.push({
      provider: 'commons',
      id: page.title,
      title: stripHtml(m.ObjectName?.value) || page.title.replace(/^File:/, ''),
      width: ii.width,
      height: ii.height,
      author: stripHtml(m.Artist?.value) || 'unknown',
      license,
      licenseUrl: m.LicenseUrl?.value,
      attributionRequired: m.AttributionRequired?.value === 'true' || /by/i.test(license),
      pageUrl: ii.descriptionurl,
      thumbUrl: ii.thumburl,
      downloadUrl: ii.url,
      warning: /sa/i.test(license) ? 'Share-alike licence: its terms may extend to the video. Prefer PD/CC0/CC BY.' : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------- Pexels
export async function searchPexels(query: string, limit = 12): Promise<Candidate[]> {
  const key = env('PEXELS_API_KEY');
  if (!key) throw new Error('PEXELS_API_KEY not set (free at https://www.pexels.com/api/). Add it to .env.');
  const data = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=landscape`, {Authorization: key});
  type Photo = {id: number; width: number; height: number; url: string; photographer: string; alt?: string; src: {original: string; medium: string}};
  return (data.photos as Photo[]).map((ph) => ({
    provider: 'pexels' as const,
    id: String(ph.id),
    title: ph.alt || `Pexels photo ${ph.id}`,
    width: ph.width,
    height: ph.height,
    author: ph.photographer,
    license: 'Pexels License (free commercial use; attribution not required)',
    licenseUrl: 'https://www.pexels.com/license/',
    attributionRequired: false,
    pageUrl: ph.url,
    thumbUrl: ph.src.medium,
    downloadUrl: ph.src.original,
  }));
}

export async function search(provider: string, query: string, limit: number): Promise<Candidate[]> {
  if (provider === 'nasa') return searchNasa(query, limit);
  if (provider === 'commons') return searchCommons(query, limit);
  if (provider === 'pexels') return searchPexels(query, limit);
  throw new Error(`Unknown source "${provider}" (nasa | commons | pexels)`);
}

export async function downloadUrlFor(c: Candidate): Promise<string> {
  return c.downloadUrl ?? (c.provider === 'nasa' ? resolveNasaDownload(c) : Promise.reject(new Error('no download URL')));
}

export async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, {headers: {'User-Agent': UA}});
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
