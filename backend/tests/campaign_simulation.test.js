/**
 * @file campaign_simulation.test.js
 * End-to-end simulation of the exact PixelCraft Studio SaaS Website Redesign Campaign.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runTargetProfiler } from '../src/agents/targetProfilerAgent.js';
import {
  buildPlan,
  buildQueue,
  evaluateGeography,
  evaluateSignals,
  evaluateCandidate,
  __internals as discoveryInternals,
} from '../src/agents/candidateDiscoveryAgent.js';
import { runNeedChecks, sanitizeNeedTests, parsePage } from '../src/agents/needCheckEngine.js';

describe('Exact Campaign Simulation: PixelCraft Studio SaaS Website Redesign', () => {
  const pixelCraftInput = {
    goal: 'Identify small-to-medium B2B SaaS companies whose websites would benefit from a redesign, UI/UX overhaul, and conversion-focused upgrade.',
    industry: 'B2B SaaS software',
    targetAudience: 'Small-to-medium B2B SaaS companies with active software products',
    geographicFocus: 'United States',
    researchFocus: 'Companies with websites that may have outdated presentation, confusing messaging, or usability issues',
    clientServiceSummary: 'Website redesign, UI/UX improvements, conversion-focused website development',
    maxLeads: 3,
    targetCompanies: [],
  };

  it('Agent 1 produces a valid targeting spec with searchMode=company_discovery/service_need and NO dated event', async () => {
    const profile = await runTargetProfiler(pixelCraftInput);

    assert.ok(profile.targetingSpec, 'Must have targetingSpec');
    assert.equal(profile.targetingSpec.temporalConstraint.required, false, 'Temporal constraint must NOT be required');
    assert.equal(profile.targetingSpec.temporalConstraint.withinDays, null);
    assert.notEqual(profile.targetingSpec.searchMode, 'event', 'searchMode must not be event');

    // Ensure fallback need tests are relevant
    const testIds = profile.targetingSpec.needTests.map((t) => t.id);
    assert.ok(testIds.includes('seo_meta_description_missing') || testIds.includes('responsive_viewport_missing'));
    assert.equal(testIds.some((id) => id.includes('product_description')), false, 'Must not include product copywriting tests');
  });

  it('Agent 2 generates clean prospecting queries without copyright dates or funding keywords', async () => {
    const profile = await runTargetProfiler(pixelCraftInput);
    const plan = buildPlan(profile);

    assert.equal(plan.eventRequired, false, 'Plan must indicate no event required');
    assert.equal(plan.windowDays, null, 'Plan must have no windowDays');

    const queue = buildQueue(plan);
    assert.ok(queue.length >= 6, 'Must generate at least 6 initial queries');

    for (const q of queue) {
      assert.doesNotMatch(q, /copyright\s*20\d{2}/i, `Query "${q}" must not search for copyright year`);
      assert.doesNotMatch(q, /\bfunding\b|\braised\b|\bseries [a-e]\b/i, `Query "${q}" must not search for funding`);
      assert.doesNotMatch(q, /\bplatform official website\b/i, `Query "${q}" must not use bare "platform official website"`);
    }
  });

  it('Candidate evaluation accepts SaaS companies with website-state criteria as probable rather than rejecting', async () => {
    const profile = await runTargetProfiler(pixelCraftInput);
    const plan = buildPlan(profile);

    // Mock candidate with a website that does not explicitly state "United States" or claim "outdated ui"
    const mockCandidate = {
      key: 'clarityflow',
      companyName: 'Clarityflow',
      seed: false,
      hostHints: new Map([['clarityflow.com', { host: 'clarityflow.com' }]]),
      profileUrls: new Set(),
      evidence: [
        {
          url: 'https://clarityflow.com',
          title: 'Clarityflow - Async Communication for Teams',
          text: 'Clarityflow is a B2B SaaS software platform for asynchronous messaging and coaching.',
          hostKind: 'unknown',
          quote: '',
          quoteOk: false,
          signalId: null,
          eventDate: null,
        },
      ],
      version: 1,
    };

    const mockCtx = {
      pageCache: new Map([
        [
          'https://clarityflow.com',
          Promise.resolve({
            ok: true,
            finalUrl: 'https://clarityflow.com',
            host: 'clarityflow.com',
            title: 'Clarityflow | Asynchronous Communication Software',
            ogTitle: 'Clarityflow',
            siteName: 'Clarityflow',
            metaDesc: 'Communicate asynchronously with your team and clients.',
            h1s: ['Async messaging for modern software teams'],
            h2s: ['Why asynchronous communication works'],
            text: 'Clarityflow software helps teams share video, audio, and text messages. We are a software company.',
          }),
        ],
      ]),
    };

    const evalResult = await evaluateCandidate(mockCandidate, plan, mockCtx);

    assert.equal(evalResult.ok, true, `Candidate should be accepted, not rejected. Detail: ${evalResult.detail}`);
    assert.ok(['verified', 'probable'].includes(evalResult.tier));
    assert.equal(evalResult.candidate.companyName, 'Clarityflow');
    assert.equal(evalResult.candidate.website, 'https://clarityflow.com');
  });
});
