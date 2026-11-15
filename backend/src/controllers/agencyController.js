import Agency from "../models/Agency.js";

const SEED_AGENCIES = [
  {
    slug: "smart-lead-finder",
    name: "Smart Lead Finder & Pitcher",
    tagline: "Verified company research and fact-grounded outreach, ready for your CRM.",
    description:
      "Seven agents discover real companies, verify source-backed facts, and prepare personalized outreach for your CRM.",
    status: "active",
    agentCount: 7,
    agentRoster: [
      "Target Profiler",
      "Candidate Discovery",
      "Company Scraper",
      "Content Relevance Filter",
      "Evidence Verification",
      "Outreach Writer",
      "CRM Structurer",
    ],
  },
  {
    slug: "deep-market-intelligence",
    name: "Deep Market Intelligence",
    tagline: "Continuous competitive and market monitoring, summarized daily.",
    description: "Tracks competitors, pricing shifts, and market signals across your sector.",
    status: "coming_soon",
    agentCount: 5,
    agentRoster: [],
  },
  {
    slug: "technical-rfp-generator",
    name: "Technical RFP Generator",
    tagline: "Turns a scope of work into a structured, submission-ready RFP response.",
    description: "Drafts technical proposals against RFP requirements with compliance checks.",
    status: "coming_soon",
    agentCount: 5,
    agentRoster: [],
  },
  {
    slug: "seo-content-squad",
    name: "SEO Content Squad",
    tagline: "Keyword research through to published, on-brand articles.",
    description: "Researches, drafts, and optimizes content clusters for organic growth.",
    status: "coming_soon",
    agentCount: 6,
    agentRoster: [],
  },
];

export async function listAgencies(_req, res) {
  try {
    const count = await Agency.countDocuments();
    if (count === 0) await Agency.insertMany(SEED_AGENCIES);
    await Agency.updateOne(
      { slug: "smart-lead-finder" },
      { $set: SEED_AGENCIES[0] },
      { upsert: true }
      
    );
    // Remove old duplicate agency record
await Agency.deleteOne({
  slug: "smart-lead-finder-pitcher",
});
    const agencies = await Agency.find().sort({ status: 1, name: 1 });
    res.json({ agencies });
  } catch (err) {
    console.error("[listAgencies]", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getAgency(req, res) {
  try {
    const agency = await Agency.findOne({ slug: req.params.slug });
    if (!agency) return res.status(404).json({ error: "Agency not found" });
    res.json({ agency });
  } catch (err) {
    console.error("[getAgency]", err);
    res.status(500).json({ error: err.message });
  }
}

