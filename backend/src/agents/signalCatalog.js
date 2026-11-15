/**
 * @file signalCatalog.js
 * The single list of "signs" a user can pick in the form. Each sign is plain DATA for the existing
 * need-check engine (needCheckEngine.js): no new detector code, no LLM.
 *
 *   - The form reads this list from the backend (listSignals), so the form can never offer a sign
 *     the backend cannot check.
 *   - When the user picks signs, those tests REPLACE whatever the LLM or fallback would have chosen.
 *
 * kind "absent" = the company shows a need if NONE of the phrases/selectors appear.
 * scope "site"  = home page plus key pages (contact, book, menu...). Needs 2+ pages read, otherwise
 *                 the engine reports the test as unavailable (unknown), never as "no need".
 * scope "home"  = home page only (for things that live in every page header/footer).
 *
 * To add a sign: add one entry here. Nothing else changes.
 */
import { sanitizeNeedTests, MAX_NEED_TESTS } from './needCheckEngine.js';

/** Most signs one project can check (limit of the engine). The form enforces this. */
export const MAX_SIGNALS = MAX_NEED_TESTS;

export const SIGNAL_CATALOG = [
  {
    id: 'seo_meta_description_missing',
    label: 'Website has no meta description',
    group: 'Website quality', hitRate: 'low',
    test: { claim: 'an SEO meta description tag', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['meta[name="description"]', 'meta[property="og:description"]'] },
  },
  {
    id: 'responsive_viewport_missing',
    label: 'Website is not mobile friendly',
    group: 'Website quality', hitRate: 'low',
    test: { claim: 'a responsive viewport meta tag', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['meta[name="viewport"]'] },
  },
  {
    id: 'og_metadata_missing',
    label: 'No social sharing preview (Open Graph)',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'Open Graph social sharing tags', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['meta[property="og:title"]', 'meta[property="og:image"]', 'meta[name="twitter:card"]'] },
  },
  {
    id: 'no_structured_data',
    label: 'No structured data (schema.org) for Google',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'schema.org structured data', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['script[type="application/ld+json"]', '[itemscope]', '[itemtype*="schema.org"]'] },
  },
  {
    id: 'no_analytics',
    label: 'No visitor analytics installed',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'a visitor analytics script', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['script[src*="googletagmanager.com"]', 'script[src*="google-analytics.com"]',
        'script[src*="gtag/js"]', 'script[src*="plausible.io"]', 'script[src*="connect.facebook.net"]'] },
  },
  {
    id: 'no_social_links',
    label: 'No social media links on the site',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'links to social media profiles', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['a[href*="facebook.com"]', 'a[href*="instagram.com"]', 'a[href*="linkedin.com"]',
        'a[href*="twitter.com"]', 'a[href*="x.com/"]', 'a[href*="tiktok.com"]', 'a[href*="youtube.com"]'] },
  },
  {
    id: 'no_click_to_call',
    label: 'No click-to-call or WhatsApp link',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'a click-to-call or WhatsApp link', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['a[href^="tel:"]', 'a[href^="callto:"]', 'a[href*="wa.me"]', 'a[href*="api.whatsapp.com"]'] },
  },
  {
    id: 'no_contact_form',
    label: 'No contact form',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'a contact or enquiry form', kind: 'absent', scope: 'site', anyText: [],
      anySelector: ['form input[type="email"]', 'form textarea', 'iframe[src*="typeform"]',
        'iframe[src*="jotform"]', 'iframe[src*="docs.google.com/forms"]'] },
  },
  {
    id: 'no_online_booking',
    label: 'No online booking or ordering',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'online booking or ordering', kind: 'absent', scope: 'site',
      anyText: ['book now', 'book online', 'book a table', 'book an appointment', 'make a reservation',
        'reserve a table', 'order online', 'add to cart', 'schedule an appointment', 'buy now'],
      anySelector: ['a[href*="calendly.com"]', 'a[href*="opentable.com"]', 'a[href*="resy.com"]',
        'a[href*="fresha.com"]', 'a[href*="booksy.com"]', 'a[href*="toasttab.com"]', 'a[href*="squareup.com"]'] },
  },
  {
    id: 'images_missing_alt',
    label: 'Images without alt text (accessibility and SEO)',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'images with no alt text', kind: 'present', scope: 'home', anyText: [],
      anySelector: ['img:not([alt]):not([width="1"]):not([height="1"])'] },
  },
  {
    id: 'outdated_html',
    label: 'Outdated page code (font, center, marquee tags)',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'outdated HTML tags (font, center or marquee)', kind: 'present', scope: 'home', anyText: [],
      anySelector: ['font', 'center', 'marquee', 'blink', 'frameset', 'body[bgcolor]'] },
  },
  {
    id: 'insecure_resources',
    label: 'Loads insecure (http) images or scripts',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'insecure http resources on the page', kind: 'present', scope: 'home', anyText: [],
      anySelector: ['img[src^="http://"]', 'script[src^="http://"]', 'iframe[src^="http://"]', 'link[rel="stylesheet"][href^="http://"]'] },
  },
  {
    id: 'no_h1_heading',
    label: 'No main heading (h1) on the homepage',
    group: 'Website quality', hitRate: 'medium',
    test: { claim: 'a main h1 heading', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['h1', '[role="heading"][aria-level="1"]', 'header h1'] },
  },
  {
    id: 'no_blog_or_articles',
    label: 'No blog, articles or news section',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'a blog or articles section', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['a[href*="blog"]', 'a[href*="news"]', 'a[href*="insights"]', 'a[href*="articles"]', 'a[href*="resources"]'] },
  },
  {
    id: 'no_testimonials',
    label: 'No client testimonials or reviews on the site',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'client testimonials or reviews', kind: 'absent', scope: 'site',
      anyText: ['testimonial', 'what our clients say', 'what clients say', 'client reviews', 'customer reviews', 'success stories', 'reviews'],
      anySelector: ['[class*="testimonial"]', '[id*="testimonial"]', '[class*="review"]'] },
  },
  {
    id: 'no_live_chat',
    label: 'No live chat or chatbot',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'a live chat or chatbot widget', kind: 'absent', scope: 'home', anyText: [],
      anySelector: ['script[src*="intercom"]', 'script[src*="tawk.to"]', 'script[src*="livechat"]', 'script[src*="drift"]',
        'script[src*="crisp.chat"]', 'script[src*="zopim"]', 'script[src*="tidio"]', 'script[src*="hs-scripts"]', 'iframe[title*="chat" i]'] },
  },
  {
    id: 'no_newsletter_signup',
    label: 'No newsletter or email sign-up',
    group: 'Website quality', hitRate: 'high',
    test: { claim: 'a newsletter or email sign-up', kind: 'absent', scope: 'site',
      anyText: ['newsletter', 'subscribe', 'join our mailing list', 'sign up for updates', 'stay updated'],
      anySelector: ['form[action*="mailchimp"]', 'form[action*="list-manage"]', 'form[action*="constantcontact"]', 'input[name*="newsletter"]'] },
  },
  // ---- About the business itself (what a salesperson would look for). Judged on the company's own pages. ----
  {
    id: 'hiring_now',
    label: 'Is hiring or has a careers page',
    group: 'Hiring & growth', hitRate: 'high',
    test: { claim: 'hiring or a careers page', kind: 'present', scope: 'site',
      anyText: ['we are hiring', "we're hiring", 'now hiring', 'join our team', 'open positions', 'current openings', 'job openings', 'work with us'],
      anySelector: ['a[href*="careers"]', 'a[href*="/jobs"]', 'a[href*="job-openings"]'] },
  },
  {
    id: 'expansion_announced',
    label: 'Announces a new location, office or expansion',
    group: 'Hiring & growth', hitRate: 'medium',
    test: { claim: 'a new location or expansion', kind: 'present', scope: 'site',
      anyText: ['new location', 'now open', 'grand opening', 'opening soon', 'we are expanding', "we're expanding", 'new office', 'second location', 'expanding to'], anySelector: [] },
  },
  {
    id: 'multiple_locations',
    label: 'Operates from several locations',
    group: 'Hiring & growth', hitRate: 'medium',
    test: { claim: 'several business locations', kind: 'present', scope: 'site',
      anyText: ['our locations', 'find a location', 'all locations', 'multiple locations', 'our branches', 'our offices'],
      anySelector: ['a[href*="locations"]', 'a[href*="branches"]'] },
  },
  {
    id: 'sells_online',
    label: 'Sells products online (online store)',
    group: 'Operations & technology', hitRate: 'medium',
    test: { claim: 'an online store', kind: 'present', scope: 'home', anyText: [],
      anySelector: ['a[href*="/cart"]', 'a[href*="checkout"]', 'form[action*="cart"]', '[class*="woocommerce"]', 'script[src*="cdn.shopify.com"]'] },
  },
  {
    id: 'accepts_online_payments',
    label: 'Takes payments online',
    group: 'Operations & technology', hitRate: 'medium',
    test: { claim: 'online payments', kind: 'present', scope: 'site', anyText: ['pay online', 'pay your bill', 'make a payment', 'pay now'],
      anySelector: ['script[src*="stripe.com"]', 'a[href*="paypal.com"]', 'script[src*="paypal.com"]', 'form[action*="paypal"]'] },
  },
  {
    id: 'customer_portal',
    label: 'Has a customer, client or patient portal',
    group: 'Operations & technology', hitRate: 'medium',
    test: { claim: 'a client or customer portal', kind: 'present', scope: 'site',
      anyText: ['client portal', 'customer portal', 'patient portal', 'member login', 'my account', 'secure login'], anySelector: [] },
  },
  {
    id: 'uses_wordpress',
    label: 'Site is built on WordPress',
    group: 'Operations & technology', hitRate: 'high',
    test: { claim: 'a WordPress website', kind: 'present', scope: 'home', anyText: [],
      anySelector: ['meta[name="generator"][content*="WordPress"]', 'link[href*="wp-content"]', 'script[src*="wp-includes"]'] },
  },
  {
    id: 'uses_diy_builder',
    label: 'Site is built with Wix, Squarespace or Weebly',
    group: 'Operations & technology', hitRate: 'medium',
    test: { claim: 'a Wix, Squarespace or Weebly site', kind: 'present', scope: 'home', anyText: [],
      anySelector: ['meta[name="generator"][content*="Wix"]', 'script[src*="wixstatic.com"]', 'meta[name="generator"][content*="Squarespace"]',
        'script[src*="squarespace"]', 'meta[name="generator"][content*="Weebly"]'] },
  },
  {
    id: 'compliance_mentions',
    label: 'Mentions compliance or regulation (HIPAA, GDPR, SOC 2, OSHA...)',
    group: 'Compliance & risk', hitRate: 'medium',
    test: { claim: 'compliance or regulatory requirements', kind: 'present', scope: 'site',
      anyText: ['hipaa', 'gdpr', 'pci dss', 'soc 2', 'iso 27001', 'osha', 'ccpa', 'regulatory compliance'], anySelector: [] },
  },
  {
    id: 'serves_businesses',
    label: 'Sells to other businesses (B2B)',
    group: 'Customers & sales', hitRate: 'medium',
    test: { claim: 'business (B2B) customers', kind: 'present', scope: 'site',
      anyText: ['for businesses', 'small business', 'commercial clients', 'enterprise clients', 'our business clients', 'b2b'], anySelector: [] },
  },
  {
    id: 'takes_quote_requests',
    label: 'Takes quote or consultation requests',
    group: 'Customers & sales', hitRate: 'high',
    test: { claim: 'quote or consultation requests', kind: 'present', scope: 'site',
      anyText: ['request a quote', 'get a quote', 'free estimate', 'free consultation', 'book a consultation', 'schedule a consultation'], anySelector: [] },
  },
];

/** What the form shows. Only ids that exist here are accepted by the backend. */
export function listSignals() {
  return SIGNAL_CATALOG.map(({ id, label, group, hitRate }) => ({ id, label, group, hitRate }));
}

/** Group headings for the form. "Website quality" is only relevant when you sell web, SEO or marketing work. */
export const SIGNAL_GROUPS = [
  { id: 'Hiring & growth', hint: 'Companies that are growing or recruiting' },
  { id: 'Operations & technology', hint: 'How the company sells, takes payments or runs its site' },
  { id: 'Compliance & risk', hint: 'Companies with regulatory obligations' },
  { id: 'Customers & sales', hint: 'Who the company sells to and how it wins work' },
  { id: 'Website quality', hint: 'Only if you sell web design, SEO or marketing: gaps in the company\'s own website' },
];

/**
 * hitRate is an ESTIMATE of how often a typical small-business site shows the sign:
 *   low = almost every modern site passes the check (a real run: only 2 of 21 sites failed meta description + viewport)
 * Replace the guesses with measured numbers once you have a few runs of data.
 */

/**
 * Starting points keyed by WHAT THE USER SELLS. They are suggestions the user can change, not rules.
 * "other" preselects nothing: the user then adds their own phrases.
 */
export const SERVICE_PRESETS = [
  { id: 'web_marketing', label: 'Websites, SEO or marketing',
    signals: ['no_structured_data', 'images_missing_alt', 'no_blog_or_articles', 'no_testimonials', 'no_live_chat', 'no_online_booking', 'og_metadata_missing'] },
  { id: 'people_ops', label: 'Recruiting, HR or payroll',
    signals: ['hiring_now', 'expansion_announced', 'multiple_locations', 'serves_businesses'] },
  { id: 'software_it', label: 'Business software or IT services',
    signals: ['uses_wordpress', 'uses_diy_builder', 'customer_portal', 'accepts_online_payments', 'multiple_locations', 'sells_online'] },
  { id: 'finance_legal', label: 'Accounting, legal or compliance',
    signals: ['compliance_mentions', 'serves_businesses', 'multiple_locations', 'expansion_announced', 'hiring_now'] },
  { id: 'commerce', label: 'E-commerce, payments or logistics',
    signals: ['sells_online', 'accepts_online_payments', 'multiple_locations', 'expansion_announced'] },
  { id: 'local_services', label: 'Cleaning, facilities or other local services',
    signals: ['multiple_locations', 'expansion_announced', 'hiring_now', 'takes_quote_requests'] },
  { id: 'other', label: 'Something else', signals: [] },
];

export function listPresets() {
  return SERVICE_PRESETS.map((p) => ({ ...p, signals: p.signals.filter(isKnownSignal).slice(0, MAX_SIGNALS) }));
}

/**
 * The user's OWN signs: a name plus words that appear on a company's site. This is what lets the system serve
 * any kind of provider with no code change.
 *   mode "present": the company shows the need when ANY phrase appears   (e.g. "franchise", "wholesale")
 *   mode "absent" : the company shows the need when NONE appears (needs 3+ phrases, an engine rule)
 */
export function needTestsFromCustom(list) {
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  const raw = (Array.isArray(list) ? list : []).map((c, i) => ({
    id: `custom_${slug(c.label) || i + 1}`,
    claim: String(c.label || '').trim().slice(0, 60),
    kind: c.mode === 'absent' ? 'absent' : 'present',
    scope: 'site',
    anyText: c.phrases,
    anySelector: [],
  }));
  return sanitizeNeedTests(raw, MAX_SIGNALS);
}

export function isKnownSignal(id) {
  return SIGNAL_CATALOG.some((s) => s.id === id);
}

/** Selected sign ids -> validated need tests for the engine. Unknown ids are ignored. */
export function needTestsFromSignals(ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).slice(0, MAX_SIGNALS));
  const tests = SIGNAL_CATALOG.filter((s) => wanted.has(s.id)).map((s) => ({ id: s.id, ...s.test }));
  return sanitizeNeedTests(tests);
}

export default SIGNAL_CATALOG;