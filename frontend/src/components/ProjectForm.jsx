import { useState } from "react";

const MAX_LEADS = 10;

// Only these three are required. Everything else is optional or filled in for you.
const REQUIRED = {
  industry: "Say which industry to search.",
  geographicFocus: "Say where to look (a country, state or city).",
  clientServiceSummary: "Describe what you offer, in a sentence or two.",
};

export default function ProjectForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({
    title: "",
    goal: "",
    clientCompanyName: "",
    industry: "",
    targetAudience: "",
    geographicFocus: "",
    researchFocus: "",
    targetCompanies: "",
    clientServiceSummary: "",
    maxLeads: "3",
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate() {
    const found = {};
    for (const [key, message] of Object.entries(REQUIRED)) {
      if (!String(form[key]).trim()) found[key] = message;
    }
    const leads = Number(form.maxLeads);
    if (!Number.isInteger(leads) || leads < 1 || leads > MAX_LEADS) {
      found.maxLeads = `Enter a whole number from 1 to ${MAX_LEADS}.`;
    }
    return found;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setTimeout(() => {
        document.querySelector("[data-field-error='true']")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }

    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v).trim()]));
    const industry = clean.industry;
    const where = clean.geographicFocus;

    // Blank optional fields are filled in so the backend always gets what it needs.
    const payload = {
      ...clean,
      title: clean.title || `${industry} - ${where}`.slice(0, 80),
      goal: clean.goal || `Find ${industry} companies in ${where}.`,
      targetAudience: clean.targetAudience || industry,
      maxLeads: String(Number(clean.maxLeads)),
    };

    const data = new FormData();
    Object.entries(payload).forEach(([k, v]) => data.append(k, v));
    if (file) data.append("file", file);
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
       <Field
  label={
    <>
      Project name{" "}
      <span className="text-sm italic text-slate-400">(Optional)</span>
    </>
  }
  hint="We name it for you if you leave this empty."
>
              <input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Karachi dental clinics"
                className="input"
              />
            </Field>
      <Field
  label="Your company name"
  hint="Used to sign your outreach emails."
  error={errors.clientCompanyName}
>
  <input
    value={form.clientCompanyName}
    onChange={(e) => update("clientCompanyName", e.target.value)}
    placeholder="ABC Web Studio"
    className="input"
    aria-invalid={Boolean(errors.clientCompanyName)}
  />
</Field>
      <Field
        label="What do you offer them?"
        hint="Describe your product or service the way you would pitch it."
        error={errors.clientServiceSummary}
      >
        <textarea
          rows={3}
          value={form.clientServiceSummary}
          onChange={(e) => update("clientServiceSummary", e.target.value)}
          placeholder="We build websites and online booking for dental clinics."
          className="input resize-none"
          aria-invalid={Boolean(errors.clientServiceSummary)}
        />
      </Field>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Which industry should we search?" hint="The type of business you want as a customer." error={errors.industry}>
          <input
            value={form.industry}
            onChange={(e) => update("industry", e.target.value)}
            placeholder="Dental clinics"
            className="input"
            aria-invalid={Boolean(errors.industry)}
          />
        </Field>

        <Field label="Where?" hint="Add a city for much better local results (for example Karachi, Pakistan). A country alone works but finds fewer." error={errors.geographicFocus}>
          <input
            value={form.geographicFocus}
            onChange={(e) => update("geographicFocus", e.target.value)}
            placeholder="Karachi, Pakistan"
            className="input"
            aria-invalid={Boolean(errors.geographicFocus)}
          />
        </Field>
      </div>

      <Field
        label="What clues should we look for?"
        hint="Optional. Anything that shows a company could use your service. We check their website, news, LinkedIn, reviews and job posts."
      >
        <textarea
          rows={3}
          value={form.researchFocus}
          onChange={(e) => update("researchFocus", e.target.value)}
          placeholder="No online booking, outdated website, hiring reception staff, opened a new branch"
          className="input resize-none"
        />
      </Field>

      <Field label="How many prospects do you want?" hint={`A number from 1 to ${MAX_LEADS}.`} error={errors.maxLeads}>
        <input
          type="number"
          min="1"
          max={MAX_LEADS}
          value={form.maxLeads}
          onChange={(e) => update("maxLeads", e.target.value)}
          placeholder="3"
          className="input max-w-[8rem]"
          aria-invalid={Boolean(errors.maxLeads)}
        />
      </Field>

      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm text-slate-800"> For better results, add more details (optional)</summary>
        <div className="mt-4 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            
           
          </div>

          <Field label="Who are your ideal customers?" hint="If you want to be more specific than the industry.">
            <input
              value={form.targetAudience}
              onChange={(e) => update("targetAudience", e.target.value)}
              placeholder="Independent clinics with one or two branches"
              className="input"
            />
          </Field>

          <Field label="What kind of prospects are you looking for?" hint="Leave empty and we write this from your industry and place.">
            <textarea
              rows={2}
              value={form.goal}
              onChange={(e) => update("goal", e.target.value)}
              placeholder="Find small dental clinics that could use better online booking."
              className="input resize-none"
            />
          </Field>

          <Field label="Any companies already in mind?" hint="Separate with commas. They are checked first.">
            <input
              value={form.targetCompanies}
              onChange={(e) => update("targetCompanies", e.target.value)}
              placeholder="Company A, Company B"
              className="input"
            />
          </Field>

          <Field label="Background document" hint="A PDF about your company. Used only as extra context.">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-blue-100 file:px-4 file:py-2 file:text-xs file:font-mono file:text-blue-700"
            />
          </Field>
        </div>
      </details>

      {Object.values(errors).some(Boolean) && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Please fix the highlighted fields.
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Dispatching agents..." : "Find my leads"}
      </button>
    </form>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="block" {...(error ? { "data-field-error": "true" } : {})}>
      <span className="mb-1.5 block text-md text-slate-900">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-700">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-600">{hint}</span>
      )}
    </label>
  );
}