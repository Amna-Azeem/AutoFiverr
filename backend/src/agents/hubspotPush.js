const BASE = "https://api.hubapi.com";

// Send a request to HubSpot.
async function hs(path, method, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      `HubSpot ${response.status}: ${
        data.message || text.slice(0, 300)
      }`
    );
  }

  return data;
}

// Extract a company's domain from its website.
function domainOf(website) {
  try {
    const value = String(website || "").trim();

    if (!value) return null;

    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`
    );

    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

// Find an existing HubSpot company or contact.
async function findOne(objectType, property, value) {
  const data = await hs(
    `/crm/v3/objects/${objectType}/search`,
    "POST",
    {
      filterGroups: [
        {
          filters: [
            {
              propertyName: property,
              operator: "EQ",
              value,
            },
          ],
        },
      ],
      limit: 1,
    }
  );

  return data.results?.[0]?.id || null;
}

// Explicitly link the contact to the company in HubSpot.
async function associateContactWithCompany(contactId, companyId) {
  await hs(
    `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`,
    "PUT"
  );
}

// Main function called by the AutoFiverr Orchestrator.
export async function pushLeadToHubspot(lead) {
  if (!process.env.HUBSPOT_TOKEN) {
    return {
      ok: false,
      skipped: true,
      reason: "HUBSPOT_TOKEN is not configured.",
    };
  }

  try {
    const companyName = String(lead.companyName || "").trim();

    if (!companyName) {
      throw new Error("The lead has no company name.");
    }

    const domain = domainOf(lead.website);

    // 1. Find the company by its domain.
    let companyId = domain
      ? await findOne("companies", "domain", domain)
      : null;

    // 2. Create the company if it does not exist.
    if (!companyId) {
      const firstEvidence = lead.verifiedEvidence?.[0];

      const company = await hs(
        "/crm/v3/objects/companies",
        "POST",
        {
          properties: {
            name: companyName,
            ...(domain ? { domain } : {}),
            ...(lead.website ? { website: lead.website } : {}),
            ...(firstEvidence?.excerpt
              ? {
                  description: String(firstEvidence.excerpt).slice(0, 300),
                }
              : {}),
          },
        }
      );

      companyId = company.id;
    }

    // 3. Get the actual contact email address.
    // Do not use lead.email here: that is the outreach message draft.
    const contactEmail = String(
      lead.contactEmail || lead.emailAddress || ""
    )
      .trim()
      .toLowerCase();

    let contactId = null;

    // 4. Find or create the contact, if an email is available.
    if (contactEmail) {
      contactId = await findOne(
        "contacts",
        "email",
        contactEmail
      );

      if (!contactId) {
        const contact = await hs(
          "/crm/v3/objects/contacts",
          "POST",
          {
            properties: {
              email: contactEmail,
            },
          }
        );

        contactId = contact.id;
      }

      // 5. Explicitly associate the contact with the company.
      if (contactId && companyId) {
        await associateContactWithCompany(contactId, companyId);
      }
    }

    return {
      ok: true,
      companyId,
      contactId,
      contactEmail: contactEmail || null,
      note: contactId
        ? "Company and contact synced; contact associated with company."
        : "Company synced; no contact email was available.",
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || String(error),
    };
  }
}