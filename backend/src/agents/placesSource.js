/**
 * @file placesSource.js
 * Second discovery source: Google Places (Text Search, "Places API (New)").
 *
 * Why: web search returns pages ABOUT businesses (listicles, directories) and the website often has to be
 * guessed from a name (13 of 14 candidates failed that way in one run). Places returns the business itself:
 * name, own website, address, phone, rating and review count. It feeds the SAME candidate pool and the
 * SAME verification gates as web search; nothing downstream changes.
 *
 * Needs GOOGLE_PLACES_API_KEY (billing enabled; website/rating fields are billed at a higher SKU, check
 * current Google pricing). Without the key this source is simply off.
 *
 * ENV: GOOGLE_PLACES_API_KEY, DISCOVERY_PLACES=off (disable), PLACES_MAX_PAGES (default 3),
 *      PLACES_MAX_REQUESTS (default 12 per run)
 */

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.rating', 'places.userRatingCount',
  'places.businessStatus', 'places.googleMapsUri', 'nextPageToken',
].join(',');

export const PLACES_MAX_PAGES = Number(process.env.PLACES_MAX_PAGES) || 3;
export const PLACES_MAX_REQUESTS = Number(process.env.PLACES_MAX_REQUESTS) || 12;

/** Only for place-based targets: a key, not switched off, and a city/state (not a whole country). */
export function placesEnabled(plan) {
  if (!process.env.GOOGLE_PLACES_API_KEY) return false;
  if (String(process.env.DISCOVERY_PLACES || '').toLowerCase() === 'off') return false;
  return Boolean(plan?.geo && !plan.geo.global && plan.geo.specific?.length);
}

/** Deterministic text queries: "<kind of business> in <place>". Up to 3 noun variants. */
export function placesQueries(plan) {
  const place = plan.geo.label || plan.geo.queryLabel;
  const nouns = [...new Set([...(plan.nouns || []), plan.targetType].filter(Boolean).map((n) => String(n).trim()))]
    .filter((n) => n.length >= 3)
    .slice(0, 3);
  return nouns.map((n) => `${n} in ${place}`.replace(/\s+/g, ' ').trim());
}

/** Next (query, page) not requested yet. Page N+1 exists only if page N returned a token. */
export function nextPlacesTask(plan, state) {
  if ((state.placesRequests || 0) >= PLACES_MAX_REQUESTS) return null;
  state.placeTokens ||= new Map();
  for (const q of placesQueries(plan)) {
    for (let page = 0; page < PLACES_MAX_PAGES; page += 1) {
      const key = `places|${q.toLowerCase()}|${page}`;
      if (state.triedTasks.has(key)) continue;
      if (page > 0 && !state.placeTokens.has(`${q.toLowerCase()}|${page}`)) break; // no token: query exhausted
      return { key, query: q, page, pageToken: page > 0 ? state.placeTokens.get(`${q.toLowerCase()}|${page}`) : undefined };
    }
  }
  return null;
}

export async function placesSearch({ query, pageToken }, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify({ textQuery: query, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    const err = new Error(`Places ${res.status}: ${body}`);
    err.fatal = res.status === 400 || res.status === 401 || res.status === 403; // bad key / API not enabled / billing
    throw err;
  }
  const data = await res.json();
  return { places: Array.isArray(data.places) ? data.places : [], nextPageToken: data.nextPageToken || null };
}

/** One Places result -> the facts discovery needs. Returns null when it cannot be used. */
export function normalizePlace(p) {
  const name = String(p?.displayName?.text || '').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return null;
  let website = null;
  try { website = p.websiteUri ? new URL(p.websiteUri).toString() : null; } catch { website = null; }
  return {
    name,
    website,
    address: String(p.formattedAddress || '').trim(),
    phone: String(p.nationalPhoneNumber || '').trim(),
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    mapsUrl: String(p.googleMapsUri || '').trim(),
  };
}

/** Plain-text summary used as context evidence (never as proof of a need). */
export function placeSummary(pl) {
  const bits = [pl.name, pl.address];
  if (pl.rating !== null) bits.push(`Google rating ${pl.rating} from ${pl.ratingCount ?? 0} reviews`);
  if (pl.phone) bits.push(`Phone ${pl.phone}`);
  return bits.filter(Boolean).join('. ');
}