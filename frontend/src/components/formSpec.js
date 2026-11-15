// formSpec.js - pure logic for ProjectForm (no React). Tested separately.
// The backend (targetProfilerAgent.parseFormSpec) re-validates everything; this file only gives
// the user fast, clear feedback and builds the payload.

// Exactly the countries the backend can verify (it checks each country's web domain and name).
export const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Ireland', 'New Zealand', 'Germany', 'France', 'Spain',
  'Italy', 'Netherlands', 'Brazil', 'Mexico', 'Pakistan', 'India', 'Bangladesh', 'United Arab Emirates', 'Saudi Arabia',
  'Qatar', 'Turkey', 'Egypt', 'Nigeria', 'Kenya', 'South Africa', 'Malaysia', 'Indonesia', 'Philippines', 'Singapore',
  'Japan', 'China',
];

export const SIZES = [
  { id: 'micro', label: 'Very small (1-10 people)' },
  { id: 'small', label: 'Small (11-50)' },
  { id: 'medium', label: 'Medium (51-200)' },
  { id: 'large', label: 'Large (200+)' },
];

// Suggestions only: the industry field accepts any text.
export const INDUSTRY_SUGGESTIONS = [
  'Law firms', 'Accounting firms', 'Restaurants & cafes', 'Clinics & healthcare', 'Dental practices', 'Real estate agencies',
  'Construction & contractors', 'Logistics & trucking', 'Manufacturing', 'Retail shops', 'E-commerce brands', 'Schools & training',
  'Hotels & travel', 'Salons & beauty', 'Software (SaaS)', 'Marketing agencies', 'Staffing agencies', 'Insurance agencies',
  'Fitness & gyms', 'Nonprofits',
];

export const LIMITS = { label: [3, 60], phrase: [3, 40], phrasesPerSign: 10, absentMinPhrases: 3, leads: [1, 10] };

export const emptyForm = () => ({
  title: '', clientCompanyName: '', sellCategory: '', clientServiceSummary: '',
  industry: '', country: '', state: '', city: '', sizes: [], keywords: '', targetCompanies: '',
  maxLeads: '3', signals: [], custom: [],
});

export function parsePhrases(text) {
  return String(text || '').split(/[,\n;]+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const isUsed = (c) => Boolean(c.label.trim() || c.phrasesText.trim());

/** Name of an own signal: what the user typed, or a readable one built from the words. */
export function customLabel(c) {
  const typed = String(c.label || '').trim();
  if (typed) return typed.slice(0, LIMITS.label[1]);
  const words = parsePhrases(c.phrasesText);
  const list = words.slice(0, 2).map((w) => `"${w}"`).join(' or ');
  return (c.mode === 'absent' ? `never mentions ${list}` : `mentions ${list}`).slice(0, LIMITS.label[1]);
}

/** Project name: what the user typed, or "<business type> - <city or country>". */
export function autoTitle(form) {
  return (form.title || '').trim() || `${form.industry.trim() || 'Prospects'} - ${form.city.trim() || form.country || 'all'}`.slice(0, 80);
}

export function usedCustom(form) {
  return form.custom.filter(isUsed);
}

export function totalSigns(form) {
  return form.signals.length + usedCustom(form).length;
}

const need = (v) => !String(v || '').trim();

/** Problems for ONE step of the form (1 offer, 2 who to find, 3 buying signals, 4 review). */
export function validateStep(form, step, maxSignals = 8) {
  const errors = [];
  if (step === 1) {
    if (need(form.clientServiceSummary)) errors.push('Describe the service you offer, in a sentence or two.');
  }
  if (step === 2) {
    if (need(form.industry)) errors.push('Say which type of business you want to find (for example "Logistics companies").');
    if (need(form.country)) errors.push('Choose a country.');
  }
  if (step === 3) {
    usedCustom(form).forEach((c, i) => {
      const name = c.label.trim() || customLabel(c) || `signal ${i + 1}`;
      const phrases = parsePhrases(c.phrasesText);
      if (c.label.trim() && (c.label.trim().length < LIMITS.label[0] || c.label.trim().length > LIMITS.label[1])) {
        errors.push(`Your signal "${name}": the name needs ${LIMITS.label[0]}-${LIMITS.label[1]} characters.`);
      }
      if (!phrases.length) errors.push(`Your signal "${name}": add at least one word or phrase to look for.`);
      if (phrases.length > LIMITS.phrasesPerSign) errors.push(`Your signal "${name}": use at most ${LIMITS.phrasesPerSign} words or phrases.`);
      if (phrases.some((p) => p.length < LIMITS.phrase[0] || p.length > LIMITS.phrase[1])) {
        errors.push(`Your signal "${name}": each word or phrase needs ${LIMITS.phrase[0]}-${LIMITS.phrase[1]} characters.`);
      }
      if (c.mode === 'absent' && phrases.length < LIMITS.absentMinPhrases) {
        errors.push(`Your signal "${name}": a "missing from their website" signal needs at least ${LIMITS.absentMinPhrases} words or phrases.`);
      }
    });
    const total = totalSigns(form);
    if (total === 0) errors.push('Pick at least one buying signal, or add your own. Signals are how we decide which companies need your service.');
    if (total > maxSignals) errors.push(`You can use at most ${maxSignals} buying signals per project (you have ${total}).`);
  }
  if (step === 4) {
    const leads = Number(form.maxLeads);
    if (!Number.isInteger(leads) || leads < LIMITS.leads[0] || leads > LIMITS.leads[1]) {
      errors.push(`Number of leads must be a whole number from ${LIMITS.leads[0]} to ${LIMITS.leads[1]}.`);
    }
  }
  return errors;
}

/** First step that has problems, with its problems; null when the whole form is fine. */
export function firstProblem(form, maxSignals = 8) {
  for (const step of [1, 2, 3, 4]) {
    const errors = validateStep(form, step, maxSignals);
    if (errors.length) return { step, errors };
  }
  return null;
}

export const validateForm = (form, maxSignals = 8) => [1, 2, 3, 4].flatMap((s) => validateStep(form, s, maxSignals));

const place = (form) => [form.city, form.state, form.country].map((s) => s.trim()).filter(Boolean).join(', ');

/** The structured spec the backend reads (targetProfilerAgent.parseFormSpec). */
export function buildSpec(form) {
  return {
    industry: form.industry.trim(),
    geography: { country: form.country, state: form.state.trim(), city: form.city.trim() },
    sizes: form.sizes,
    keywords: parsePhrases(form.keywords),
    signals: form.signals,
    customSignals: usedCustom(form).map((c) => ({ label: customLabel(c), mode: c.mode, phrases: parsePhrases(c.phrasesText) })),
    includeCompanies: parsePhrases(form.targetCompanies),
  };
}

/** Payload: old field names (so the current backend keeps working) + the new structured `spec`. */
export function buildFormData(form, catalog, file) {
  const labels = new Map((catalog?.signals || []).map((s) => [s.id, s.label]));
  const signLabels = [...form.signals.map((id) => labels.get(id) || id), ...usedCustom(form).map((c) => customLabel(c))];
  const sizeLabels = SIZES.filter((s) => form.sizes.includes(s.id)).map((s) => s.label.split(' (')[0].toLowerCase());
  const where = place(form);
  const data = new FormData();
  data.append('title', autoTitle(form));
  data.append('clientCompanyName', form.clientCompanyName.trim());
  data.append('industry', form.industry.trim());
  data.append('goal', `Find ${sizeLabels.length ? `${sizeLabels.join(' / ')} ` : ''}${form.industry.trim()} companies in ${where}.`);
  data.append('targetAudience', `${form.industry.trim()}${sizeLabels.length ? `, ${sizeLabels.join(' / ')}` : ''}`);
  data.append('geographicFocus', where);
  data.append('researchFocus', signLabels.join(', '));
  data.append('targetCompanies', form.targetCompanies.trim());
  data.append('clientServiceSummary', form.clientServiceSummary.trim());
  data.append('maxLeads', String(Number(form.maxLeads)));
  data.append('spec', JSON.stringify(buildSpec(form)));
  if (file) data.append('file', file);
  return data;
}