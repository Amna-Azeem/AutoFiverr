// Builds a CSV for the CRM the user picks. Runs in the browser, no backend change needed.
// To support another CRM, add one entry to CRMS below. Nothing else changes.

const cell = (v) => {
  const s = String(v ?? "").replace(/\r?\n/g, "\n");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function domainOf(website) {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
      .hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function evidenceSummary(lead) {
  return (lead.verifiedEvidence || [])
    .slice(0, 2)
    .map((e) => `${e.signal || "Evidence"}: ${String(e.excerpt || "").slice(0, 200)} (${e.sourceUrl || ""})`)
    .join(" | ");
}

// Short note that goes into the CRM's description/notes column.
function notes(lead) {
  const parts = [evidenceSummary(lead)];
  if (lead.contactFormUrl) parts.push(`Contact form: ${lead.contactFormUrl}`);
  if (lead.linkedinUrl) parts.push(`LinkedIn: ${lead.linkedinUrl}`);
  return parts.filter(Boolean).join(" | ");
}

// Each CRM is a list of [column header, function(lead) -> value].
export const CRMS = {
  generic: {
    label: "Generic CSV (any CRM)",
    buttonLabel: "Download Generic CSV",
    help: [
      "Open your CRM and find its Import option (usually under Contacts, Leads or Companies).",
      "Upload this file.",
      "Match each column to the matching field in your CRM, then finish the import.",
    ],
    columns: [
      ["Company name", (l) => l.companyName],
      ["Website", (l) => l.website],
      ["Domain", (l) => domainOf(l.website)],
      ["Email", (l) => l.contactEmail],
      ["Phone", (l) => l.contactPhone],
      ["LinkedIn", (l) => l.linkedinUrl],
      ["Contact form URL", (l) => l.contactFormUrl],
      ["Evidence", (l) => evidenceSummary(l)],
      ["Outreach subject", (l) => l.subject],
      ["Outreach email", (l) => l.email],
      ["Needs review", (l) => (l.needsReview ? "Yes" : "No")],
    ],
  },

  hubspot: {
    label: "HubSpot",
    help: [
      "In HubSpot open Contacts, then click Import.",
      "Choose \"Import from file\", then \"File from computer\", then \"One file\".",
      "Select Companies (and Contacts if you want the people with emails), then upload the file.",
      "HubSpot maps the columns by name. Check the preview and finish the import.",
    ],
    columns: [
      ["Company name", (l) => l.companyName],
      ["Company Domain Name", (l) => domainOf(l.website)],
      ["Website URL", (l) => l.website],
      ["Email", (l) => l.contactEmail],
      ["Phone Number", (l) => l.contactPhone],
      ["LinkedIn Company Page", (l) => l.linkedinUrl],
      ["Description", (l) => evidenceSummary(l)],
      ["Lead Status", () => "NEW"],
      ["Contact form URL", (l) => l.contactFormUrl],
      ["Outreach subject", (l) => l.subject],
      ["Outreach email", (l) => l.email],
    ],
  },

  salesforce: {
    label: "Salesforce",
    help: [
      "In Salesforce open the Leads tab, then use Import (Data Import Wizard).",
      "Choose Leads, then \"Add new records\", and upload the file.",
      "Map the columns to Lead fields. Create custom fields first if you want to keep the outreach email.",
      "Salesforce requires Last Name and Company. Last Name is filled with a placeholder you can change later.",
    ],
    columns: [
      ["Last Name", () => "Team"],
      ["Company", (l) => l.companyName],
      ["Website", (l) => l.website],
      ["Email", (l) => l.contactEmail],
      ["Phone", (l) => l.contactPhone],
      ["Lead Status", () => "Open - Not Contacted"],
      ["Description", (l) => notes(l)],
      ["Outreach subject", (l) => l.subject],
      ["Outreach email", (l) => l.email],
    ],
  },

  zoho: {
    label: "Zoho CRM",
    help: [
      "In Zoho CRM open Leads, then click Import Leads.",
      "Choose \"From a file\" and upload this CSV.",
      "Map the columns to Lead fields, then finish the import.",
      "Zoho requires Last Name and Company. Last Name is filled with a placeholder you can change later.",
    ],
    columns: [
      ["Last Name", () => "Team"],
      ["Company", (l) => l.companyName],
      ["Website", (l) => l.website],
      ["Email", (l) => l.contactEmail],
      ["Phone", (l) => l.contactPhone],
      ["Lead Status", () => "Not Contacted"],
      ["Description", (l) => notes(l)],
      ["Outreach subject", (l) => l.subject],
      ["Outreach email", (l) => l.email],
    ],
  },

  pipedrive: {
    label: "Pipedrive",
    help: [
      "In Pipedrive open Settings, then Import data, then From a spreadsheet.",
      "Upload this file.",
      "Map the columns to Organization and Person fields, then finish the import.",
    ],
    columns: [
      ["Organization - Name", (l) => l.companyName],
      ["Organization - Website", (l) => l.website],
      ["Person - Name", (l) => l.companyName],
      ["Person - Email", (l) => l.contactEmail],
      ["Person - Phone", (l) => l.contactPhone],
      ["Note", (l) => notes(l)],
      ["Outreach subject", (l) => l.subject],
      ["Outreach email", (l) => l.email],
    ],
  },
};

export function buildCrmCsv(leads = [], crmId = "generic") {
  const crm = CRMS[crmId] || CRMS.generic;
  const headers = crm.columns.map(([header]) => header);
  const rows = leads.map((lead) => crm.columns.map(([, get]) => get(lead)));
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCrmCsv(leads, crmId = "generic", projectName = "leads") {
  const blob = new Blob([buildCrmCsv(leads, crmId)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = String(projectName).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "leads";
  a.href = url;
  a.download = `${base}-${crmId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}