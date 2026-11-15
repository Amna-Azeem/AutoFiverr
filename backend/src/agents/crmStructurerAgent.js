/**
 * @file crmStructurerAgent.js
 * Agent 7 — CRM Structurer
 *
 * Final deterministic gate after Agent 5 + Agent 6.5.
 *
 * Input:
 *   {
 *     ...agent5.output,
 *     ...agent65.output
 *   }
 *
 * No LLM. No research.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as docx from 'docx';

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
  BorderStyle,
  PageBreak,
} = docx;

const AGENT_NAME = 'CRMStructurer';

const MIN_VERIFIED_EVIDENCE = Math.max(
  1,
  Number(process.env.MIN_VERIFIED_EVIDENCE) || 1,
);

const DEFAULT_OUT_DIR =
  process.env.EXPORT_DIR ||
  path.resolve(process.cwd(), 'exports');

const AGENT_LABELS = {
  1: 'Target Profiler',
  2: 'Candidate Discovery',
  3: 'Company Scraper',
  4: 'Content Relevance Filter',
  5: 'Evidence Verification',
  6: 'Outreach Writer',
  6.5: 'Outreach QA',
  7: 'CRM Structurer',
};

/**
 * Structured JSON logger.
 */
function log(level, message, meta = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    agent: AGENT_NAME,
    level,
    message,
    ...meta,
  });

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Check HTTP/HTTPS URL.
 */
function isHttpUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize whitespace/case.
 */
function norm(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Simple title case.
 */
function titleCase(value) {
  return String(value ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deterministic lead ID.
 */
function makeLeadId(companyName, website) {
  let host = '';

  try {
    host = website
      ? new URL(website).hostname.replace(/^www\./, '')
      : '';
  } catch {
    host = '';
  }

  return createHash('sha1')
    .update(
      `${String(companyName).toLowerCase().trim()}|${host}`,
    )
    .digest('hex')
    .slice(0, 12);
}

/**
 * Agent 7 entry point for ONE lead.
 *
 * @param {{
 *   companyName:string,
 *   website:string|null,
 *   verifiedEvidence:Array,
 *   subject:string,
 *   email:string,
 *   usedEvidence:Array,
 *   qa:{passed:boolean, checkedSentences?:number}
 * }} input
 *
 * @param {{
 *   collection?: {bulkWrite:Function},
 *   projectId?: string
 * }} options
 */
export async function runCrmStructurer(input, options = {}) {
  const startedAt = Date.now();

  const discard = (reason) => {
    log('warn', 'Lead discarded', {
      company: input?.companyName ?? null,
      reason,
    });

    return {
      status: 'discarded',
      output: null,
      reason,
      metrics: {
        durationMs: Date.now() - startedAt,
      },
    };
  };

  if (!input || typeof input !== 'object') {
    return discard('input missing');
  }

  const companyName = String(input.companyName ?? '').trim();

  if (!companyName) {
    return discard('company name missing');
  }

  log('info', 'Agent started', {
    company: companyName,
  });

  const website = input.website
    ? String(input.website).trim()
    : null;

  if (website && !isHttpUrl(website)) {
    return discard('website is not a valid URL');
  }

  /*
   * ---------------------------------------------------------
   * 1. VERIFIED EVIDENCE CHECK
   * ---------------------------------------------------------
   */

  const evidence = Array.isArray(input.verifiedEvidence)
    ? input.verifiedEvidence
    : [];

  if (!evidence.length) {
    return discard('verified evidence missing');
  }

  if (evidence.length < MIN_VERIFIED_EVIDENCE) {
    return discard(
      `fewer than ${MIN_VERIFIED_EVIDENCE} verified evidence items`,
    );
  }

  const invalidEvidence = evidence.find((e) => {
    if (!e || typeof e !== 'object') return true;

    if (e.verified !== true) return true;

    if (!String(e.excerpt ?? '').trim()) return true;

    if (!String(e.sourceTitle ?? '').trim()) return true;

    if (!isHttpUrl(e.sourceUrl)) return true;

    return false;
  });

  if (invalidEvidence) {
    return discard(
      'an evidence item is unverified or has a missing source',
    );
  }

  /*
   * ---------------------------------------------------------
   * 2. OUTREACH CHECK
   * ---------------------------------------------------------
   */

    const email = String(input.email ?? '').trim();
  const subject = String(input.subject ?? '').trim();

  // The lead survives no matter what. Only the email is labelled.
  let outreachStatus =
    !email || !subject ? 'missing' : input.qa?.passed === true ? 'passed' : 'needs_review';
  /*
   * ---------------------------------------------------------
   * 3. USED EVIDENCE CHECK
   * ---------------------------------------------------------
   *
   * Outreach may only reference evidence that Agent 5 verified.
   */
    const knownEvidence = new Set(
    evidence.map((e) => `${String(e.sourceUrl)}|${norm(e.excerpt)}`),
  );

  const rawUsed = Array.isArray(input.usedEvidence) ? input.usedEvidence : [];

  // Keep only used-evidence items that match Agent 5's verified evidence.
  const usedEvidence = rawUsed.filter(
    (u) =>
      u &&
      typeof u === 'object' &&
      knownEvidence.has(`${String(u.sourceUrl ?? '')}|${norm(u.excerpt)}`),
  );

  if (outreachStatus === 'passed' && (!usedEvidence.length || usedEvidence.length !== rawUsed.length)) {
    outreachStatus = 'needs_review';
  }

 


  /*
   * ---------------------------------------------------------
   * 4. SOURCE INDEX
   * ---------------------------------------------------------
   */

  const sourceIndex = new Map();
  const sources = [];

  for (const evidenceItem of evidence) {
    const sourceUrl = String(evidenceItem.sourceUrl);

    if (!sourceIndex.has(sourceUrl)) {
      const id = sources.length + 1;

      sourceIndex.set(sourceUrl, id);

      sources.push({
        id,
        title: String(evidenceItem.sourceTitle),
        url: sourceUrl,
        verificationMethod:
          evidenceItem.sourceCheck ?? 'verified',
        verifiedAt:
          evidenceItem.verifiedAt ?? null,
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * 5. FINAL CRM RECORD
   * ---------------------------------------------------------
   */

  const record = {
    leadId: makeLeadId(companyName, website),
    status: 'crm_ready',
    evidenceCount: evidence.length,
    sourceCount: sources.length,

    companyName,

    website,

    verifiedEvidence: evidence.map((evidenceItem) => ({
      ...evidenceItem,
      citationId: sourceIndex.get(
        String(evidenceItem.sourceUrl),
      ),
    })),

    
        subject,
    contactEmail: input.contactEmail ?? null,
    contactEmails: Array.isArray(input.contactEmails) ? input.contactEmails : [],
    contactFormUrl: input.contactFormUrl ?? null,
    // How this lead can actually be reached: a real address, a contact form, or neither.
    contactPhone: input.contactPhone ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    contactMethod: input.contactEmail
      ? 'email'
      : input.contactFormUrl
        ? 'contact_form'
        : input.linkedinUrl
          ? 'linkedin'
          : input.contactPhone
            ? 'phone'
            : 'none',
    outreachSource: input.outreachSource ?? null,

    email,

    outreachStatus,

    outreachMistakes: Array.isArray(input.mistakes) ? input.mistakes : [],

    usedEvidence,

    qa: {
      passed: input.qa?.passed === true,
      repaired: input.qa?.repaired === true,
      repairAttempts: input.qa?.repairAttempts ?? 0,
      checkedSentences:
        input.qa?.checkedSentences ?? null,
    },

    sources,

    createdAt: new Date().toISOString(),
  };

  /*
   * ---------------------------------------------------------
   * 6. OPTIONAL MONGODB PERSISTENCE
   * ---------------------------------------------------------
   */

  if (options.collection) {
    try {
      await options.collection.bulkWrite([
        {
          updateOne: {
            filter: {
              leadId: record.leadId,
              projectId: options.projectId ?? null,
            },

            update: {
              $set: {
                ...record,
                projectId: options.projectId ?? null,
              },
            },

            upsert: true,
          },
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      log('error', 'MongoDB persistence failed', {
        company: companyName,
        error: message,
      });

      return discard(
        `CRM record could not be saved: ${message}`,
      );
    }
  }

  log('info', 'Agent completed', {
    company: companyName,
    leadId: record.leadId,
    sources: sources.length,
  });

  return {
    status: 'success',
    output: record,
    metrics: {
      durationMs: Date.now() - startedAt,
    },
  };
}

/**
 * Escape CSV cell and prevent spreadsheet formula injection.
 */
function csvCell(value) {
  let text =
    value === null || value === undefined
      ? ''
      : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * Builds CSV export.
 */
export function buildCsv(leads) {
  const header = [
    'leadId',
    'companyName',
    'website',
    'verifiedEvidenceCount',
    'verifiedEvidence',
    'sources',
    'emailSubject',
    'email',
    'outreachStatus',
    'contactEmail',
    'contactMethod',
    'contactFormUrl',
    'contactPhone',
    'linkedinUrl',
  ];

  const rows = leads.map((lead) => [
    lead.leadId,

    lead.companyName,

    lead.website ?? '',

    Array.isArray(lead.verifiedEvidence)
      ? lead.verifiedEvidence.length
      : 0,

    Array.isArray(lead.verifiedEvidence)
      ? lead.verifiedEvidence
          .map(
            (e) =>
              `${e.signal ?? ''}: ${e.excerpt ?? ''} [${e.citationId ?? ''}]`,
          )
          .join(' || ')
      : '',

    Array.isArray(lead.sources)
      ? lead.sources
          .map(
            (s) =>
              `[${s.id}] ${s.title} - ${s.url}`,
          )
          .join(' || ')
      : '',

    lead.subject,

    lead.email,
    lead.outreachStatus ?? '',
    lead.contactEmail ?? '',
    lead.contactMethod ?? '',
    lead.contactFormUrl ?? '',
    lead.contactPhone ?? '',
    lead.linkedinUrl ?? '',
  ]);

  return (
    '\uFEFF' +
    [...rows.length ? [header, ...rows] : [header]]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n') +
    '\r\n'
  );
}

/**
 * CRM import CSV: one clean value per column, standard field names.
 */
export function buildCrmCsv(leads) {
  const header = [
    'Company Name',
    'Website',
    'Contact Email',
    'Alternate Emails',
    'Lead Status',
    'Lead Source',
    'Top Signal',
    'Signal Summary',
    'Evidence URL',
    'Email Subject',
    'Email Draft',
    'Email Status',
    'Notes',
    'Created Date',
    'Lead ID',
    'Contact Method',
    'Contact Form URL',
    'Phone',
    'LinkedIn',
  ];

  const rows = leads.map((lead) => {
    const evidence = Array.isArray(lead.verifiedEvidence) ? lead.verifiedEvidence : [];
    const first = evidence[0] || {};

    return [
      lead.companyName,
      lead.website ?? '',
      lead.contactEmail ?? '',
      (lead.contactEmails || []).join('; '),
      'New',
      'AutoFiverr',
      first.signal ?? '',
      String(first.excerpt ?? '').slice(0, 300),
      first.sourceUrl ?? '',
      lead.subject ?? '',
      lead.email ?? '',
      lead.outreachStatus ?? '',
      evidence
        .map((e) => `${e.signal ?? 'evidence'}: ${String(e.excerpt ?? '').slice(0, 200)}`)
        .join(' | '),
      String(lead.createdAt ?? '').slice(0, 10),
      lead.leadId,
      lead.contactMethod ?? '',
      lead.contactFormUrl ?? '',
      lead.contactPhone ?? '',
      lead.linkedinUrl ?? '',
    ];
  });

  return (
    '\uFEFF' +
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}

/**
 * Create clickable Word hyperlink.
 */
function link(url, text) {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text: text ?? url,
        style: 'Hyperlink',
      }),
    ],
  });
}

/**
 * Builds Word report.
 */
export async function buildWordReport(
  leads,
  {
    projectName = 'Lead Report',
    profile = {},
  } = {},
) {
  const children = [];

  const paragraph = (runs, options = {}) =>
    new Paragraph({
      children: Array.isArray(runs)
        ? runs
        : [new TextRun(String(runs))],
      ...options,
    });

  /*
   * ---------------------------------------------------------
   * TITLE
   * ---------------------------------------------------------
   */

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun(projectName),
      ],
    }),
  );

  children.push(
    paragraph([
      new TextRun({
        text:
          `Generated ${new Date()
            .toISOString()
            .slice(0, 10)} • ${leads.length} qualified lead(s)`,
        color: '666666',
      }),
    ]),
  );

  /*
   * ---------------------------------------------------------
   * PROFILE
   * ---------------------------------------------------------
   */

  const profileLines = [
    ['Goal', profile.goal],
    ['Industry', profile.industry],
    ['Target audience', profile.targetAudience],
    ['Geographic focus', profile.geographicFocus],
    ['Research focus', profile.researchFocus],
  ].filter(([, value]) => value);

  for (const [label, value] of profileLines) {
    children.push(
      paragraph([
        new TextRun({
          text: `${label}: `,
          bold: true,
        }),
        new TextRun(String(value)),
      ]),
    );
  }

  children.push(
    paragraph(
      [
        new TextRun({
          text:
            'Every evidence excerpt below is a verbatim quote from the cited public page, followed by a bracketed citation that maps to the numbered source list under each company.',
          italics: true,
          color: '666666',
        }),
      ],
      {
        spacing: {
          before: 120,
        },
      },
    ),
  );

  /*
   * ---------------------------------------------------------
   * LEADS
   * ---------------------------------------------------------
   */

  leads.forEach((lead, index) => {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      }),
    );

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun(
            `${index + 1}. ${lead.companyName}`,
          ),
        ],
      }),
    );

    children.push(
      paragraph([
        new TextRun({
          text: 'Website: ',
          bold: true,
        }),

        lead.website
          ? link(lead.website)
          : new TextRun('Not available'),
      ]),
    );

    /*
     * VERIFIED EVIDENCE
     */

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun('Verified evidence'),
        ],
      }),
    );

    lead.verifiedEvidence.forEach((evidenceItem) => {
      children.push(
        paragraph(
          [
            new TextRun({
              text:
                `${titleCase(
                  evidenceItem.signal ?? 'Evidence',
                )}: `,
              bold: true,
            }),

            new TextRun({
              text:
                `“${evidenceItem.excerpt}”`,
            }),

            new TextRun({
              text:
                ` [${evidenceItem.citationId}]`,
              bold: true,
              color: '1F4FD8',
            }),
          ],
          {
            spacing: {
              before: 100,
            },
          },
        ),
      );
    });

    /*
     * OUTREACH EMAIL
     */

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun('Outreach email'),
        ],
      }),
    );

    if (lead.subject) {
      children.push(
        paragraph([
          new TextRun({
            text: 'Subject: ',
            bold: true,
          }),
          new TextRun(lead.subject),
        ]),
      );
    }

    String(lead.email)
      .split(/\r?\n/)
      .forEach((line) => {
        children.push(
          paragraph(line || ' ', {
            indent: {
              left: 240,
            },

            border: {
              left: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: 'B7C4F5',
                space: 8,
              },
            },
          }),
        );
      });

    /*
     * USED CITATIONS
     */

    const usedCitations = [
      ...new Set(
        lead.usedEvidence
          .map((used) => {
            const match =
              lead.verifiedEvidence.find(
                (verified) =>
                  verified.sourceUrl ===
                    used.sourceUrl &&
                  norm(verified.excerpt) ===
                    norm(used.excerpt),
              );

            return match?.citationId;
          })
          .filter(Boolean),
      ),
    ].sort((a, b) => a - b);

    if (usedCitations.length || lead.outreachStatus !== 'passed') {
      children.push(
        paragraph(
          [
            new TextRun({
              text:
                               lead.outreachStatus === 'passed'
                  ? `This email is based on evidence from sources ${usedCitations
                      .map((id) => `[${id}]`)
                      .join(', ')} and passed the outreach QA check.`
                  : lead.outreachStatus === 'missing'
                    ? `No outreach email was generated for this lead.`
                    : `This email is a draft that did not pass the outreach QA check. Review it before sending.`,
              italics: true,
              color: '666666',
              size: 20,
            }),
          ],
          {
            spacing: {
              before: 80,
            },
          },
        ),
      );
    }

    /*
     * SOURCES
     */

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun('Sources'),
        ],
      }),
    );

    lead.sources.forEach((source) => {
      const checked = source.verifiedAt
        ? ` Verified ${source.verifiedAt.slice(
            0,
            10,
          )} (${source.verificationMethod}).`
        : '';

      children.push(
        paragraph(
          [
            new TextRun({
              text: `[${source.id}] `,
              bold: true,
            }),

            new TextRun(
              `${source.title}. `,
            ),

            link(source.url),

            new TextRun(checked),
          ],
          {
            spacing: {
              before: 60,
            },
          },
        ),
      );
    });
  });

  /*
   * ---------------------------------------------------------
   * DOCUMENT
   * ---------------------------------------------------------
   */

  const document = new Document({
    creator: 'AutoFiverr',

    title: projectName,

    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 22,
          },
        },
      },

      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          run: {
            size: 40,
            bold: true,
            font: 'Arial',
          },
          paragraph: {
            spacing: {
              after: 160,
            },
          },
        },

        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 32,
            bold: true,
            font: 'Arial',
          },
          paragraph: {
            spacing: {
              before: 240,
              after: 120,
            },
            outlineLevel: 0,
          },
        },

        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 26,
            bold: true,
            font: 'Arial',
          },
          paragraph: {
            spacing: {
              before: 200,
              after: 80,
            },
            outlineLevel: 1,
          },
        },
      ],

      characterStyles: [
        {
          id: 'Hyperlink',
          name: 'Hyperlink',
          basedOn: 'DefaultParagraphFont',
          run: {
            color: '0563C1',
            underline: {
              type: 'single',
            },
          },
        },
      ],
    },

    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
            },

            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },

        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

/**
 * Builds screenshot-style project run report.
 */
export function buildProjectReport({
  projectName,
  profile,
  discovery,
  trace = [],
  leads = [],
  runtimeMs,
  files = {},
}) {
  const scraperQueries = trace
    .filter((traceItem) => traceItem.agent === 3)
    .reduce(
      (sum, traceItem) =>
        sum +
        (Number(
          traceItem.metrics?.searchQueriesRun,
        ) || 0),
      0,
    );

  const searchQueries =
    (Number(discovery?.searchQueriesRun) || 0) +
    scraperQueries;

  const computedRuntime = trace.reduce(
    (sum, traceItem) =>
      sum +
      (Number(
        traceItem.durationMs ??
          traceItem.metrics?.durationMs,
      ) || 0),
    0,
  );

  return {
    project: projectName,

    summary: {
      leadsFound: leads.length,

      searchQueries,

      runtimeSeconds: Number(
        (
          ((runtimeMs ?? computedRuntime) || 0) /
          1000
        ).toFixed(1),
      ),

      candidatesRequested:
        discovery?.requested ??
        profile?.maxLeads ??
        0,

      candidatesFound:
        discovery?.found ?? 0,
    },

    agentResults: trace.map((traceItem) => ({
      agent: traceItem.agent,

      name:
        AGENT_LABELS[traceItem.agent] ??
        `Agent ${traceItem.agent}`,

      company:
        traceItem.company ?? null,

      status:
        traceItem.status === 'success'
          ? 'SUCCESS'
          : String(
              traceItem.status ?? '',
            ).toUpperCase(),

      input: traceItem.input ?? null,

      output: traceItem.output ?? null,

      reason:
        traceItem.reason ?? null,

      durationMs:
        traceItem.durationMs ??
        traceItem.metrics?.durationMs ??
        null,
    })),

    emails: leads.map((lead) => ({
      leadId: lead.leadId,
      companyName: lead.companyName,
      subject: lead.subject,
      email: lead.email,
    })),

    leads,

    files,
  };
}

/**
 * Writes JSON, CSV and Word exports.
 */
export async function exportLeads(
  leads,
  options = {},
) {
  if (
    !Array.isArray(leads) ||
    leads.length === 0
  ) {
    throw new Error(
      'CRM export: no qualified leads to export',
    );
  }

  const outDir =
    options.outDir ?? DEFAULT_OUT_DIR;

  const projectName =
    options.projectName ?? 'Lead Report';

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const slug = (
    options.baseName ?? projectName
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'leads';

  const base = path.join(
    outDir,
    `${slug}-${stamp}`,
  );

  await mkdir(outDir, {
    recursive: true,
  });

  const jsonPayload = {
    project: projectName,

    generatedAt:
      new Date().toISOString(),

    leadCount: leads.length,

    leads,

    ...(options.report
      ? {
          report: options.report,
        }
      : {}),
  };

   const files = {
    json: `${base}.json`,
    csv: `${base}.csv`,
    crmCsv: `${base}-crm.csv`,
    docx: `${base}.docx`,
  };

  await Promise.all([
    writeFile(
      files.json,
      JSON.stringify(
        jsonPayload,
        null,
        2,
      ),
      'utf8',
    ),

    writeFile(
      files.csv,
      buildCsv(leads),
      'utf8',
    ),

        writeFile(
      files.crmCsv,
      buildCrmCsv(leads),
      'utf8',
    ),

    

    buildWordReport(leads, {
      projectName,
      profile: options.profile,
    }).then((buffer) =>
      writeFile(
        files.docx,
        buffer,
      ),
    ),
  ]);

  log('info', 'Exports written', {
    leads: leads.length,
    ...files,
  });

  return files;
}

export default runCrmStructurer;