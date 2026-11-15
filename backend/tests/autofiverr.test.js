/**
 * @file autofiverr.test.js
 * Comprehensive regression test suite covering all 8 test requirements from PART 7.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';

import {
  runTargetProfiler,
  __internals as profilerInternals,
  fallbackNeedTests,
  inferExplicitWindowDays,
  buildFallbackSpec,
  normalizeSpec,
} from '../src/agents/targetProfilerAgent.js';

import {
  runCandidateDiscovery,
  __internals as discoveryInternals,
  buildPlan,
  buildQueue,
  evaluateGeography,
  deterministicMoreQueries,
  proposeMoreQueries,
  checkIdentity,
  siteSourceKind,
  domainGuesses,
  evaluateSignals,
} from '../src/agents/candidateDiscoveryAgent.js';

import {
  isProductPageUrl,
  isCategoryPageUrl,
  hasSubstantiveProductDescription,
  hasSubstantiveCategoryDescription,
  judge,
  runNeedChecks,
  sanitizeNeedTests,
  parsePage,
} from '../src/agents/needCheckEngine.js';

import { setMockGeminiHandler, clearMockGeminiHandler } from '../src/agents/Llmclient.js';

describe('AutoFiverr Lead Finder & Pitcher Regression Tests', () => {

  /* =========================================================================
     TEST 1: Website Redesign Campaign
     ========================================================================= */
  describe('Test 1 — Website Redesign Campaign', () => {
    const redesignProfile = {
      goal: 'Find potential B2B SaaS companies that could benefit from a modern website redesign and UX upgrade',
      industry: 'B2B SaaS software companies',
      targetAudience: 'Small to mid-sized B2B SaaS software companies with established products',
      geographicFocus: 'United States',
      researchFocus: 'Companies with websites that need redesign or UI/UX improvements',
      clientServiceSummary: 'Website redesign, UI/UX improvements, conversion-focused website development',
      maxLeads: 3,
      targetCompanies: [],
    };

    it('Agent 1 must not turn a website-redesign campaign into an event campaign', async () => {
      // Test deterministic fallback spec
      const fallbackSpec = buildFallbackSpec(redesignProfile);
      assert.notEqual(fallbackSpec.searchMode, 'event', 'Fallback searchMode must not be event');
      assert.equal(fallbackSpec.temporalConstraint.required, false, 'Temporal constraint must not be required');
      assert.equal(fallbackSpec.temporalConstraint.withinDays, null);

      // Test normalizeSpec with model output containing website_state
      const simulatedModelSpec = {
        entityType: 'company',
        targetCompanyType: 'B2B SaaS software companies',
        targetDefinition: 'B2B SaaS providers with active products',
        businessNouns: ['SaaS company', 'software provider'],
        searchMode: 'event', // Model mistakenly returned 'event'
        mustHaveTerms: ['software', 'saas', 'cloud', 'b2b'],
        mustNotHaveTerms: ['agency', 'consultancy'],
        signalTerms: ['outdated ui', 'old website'],
        signalRequirementMode: 'any',
        signalRequirements: [
          {
            id: 'website_state_check',
            label: 'Outdated Website State',
            terms: ['copyright 2019', 'non-responsive', 'outdated ui'],
            required: true,
            evidenceType: 'website_state',
            description: 'Observable website presentation condition',
          },
        ],
        temporalConstraint: {
          required: true, // Model mistakenly returned true
          withinDays: null,
          eventDescription: 'No specific temporal constraint required.',
        },
        queries: [
          'B2B SaaS software companies',
          'B2B cloud platforms',
          'SaaS software products',
        ],
        needTests: [],
      };

      const normalized = normalizeSpec(simulatedModelSpec, redesignProfile, null);
      assert.notEqual(normalized.searchMode, 'event', 'Normalized searchMode must be corrected to service_need or company_discovery');
      assert.equal(normalized.temporalConstraint.required, false, 'temporalConstraint.required must be false when no dated_event');
      assert.equal(normalized.temporalConstraint.withinDays, null);
    });

    it('Agent 2 must not generate automatic copyright-year searches', () => {
      const plan = buildPlan(redesignProfile);
      assert.equal(plan.eventRequired, false, 'eventRequired must be false');
      assert.equal(plan.windowDays, null, 'windowDays must be null');

      const queue = buildQueue(plan);
      for (const q of queue) {
        assert.doesNotMatch(q, /copyright\s*20\d{2}/i, `Queue query "${q}" must not contain copyright year`);
        assert.doesNotMatch(q, /\blaunched\b|\bfunding\b|\braised\b/i, `Queue query "${q}" must not contain dated event terms`);
      }
    });

    it('Third-party results must not be accepted as proof of website-state condition', () => {
      const plan = buildPlan(redesignProfile);
      const req = {
        id: 'website_state_check',
        evidenceType: 'website_state',
        terms: ['outdated website', 'redesign'],
      };
      const planWithSignal = {
        ...plan,
        requiredSignals: [req],
      };
      const candidate = {
        companyName: 'Acme SaaS',
        evidence: [
          {
            signalId: 'website_state_check',
            quoteOk: true,
            quote: 'Acme SaaS has an outdated website that needs redesign according to blogger',
            url: 'https://techblog.com/review',
          },
        ],
      };

      // When evaluateSignals runs with only third-party snippet and no site text match
      const signals = evaluateSignals(candidate, planWithSignal, 'Acme SaaS is a modern B2B analytics platform', ['acme', 'saas']);
      assert.equal(signals.status, 'unverified', 'Third party claim must not be accepted as verified website state');
    });
  });

  /* =========================================================================
     TEST 2: Genuine Dated-Event Campaign
     ========================================================================= */
  describe('Test 2 — Genuine Dated-Event Campaign', () => {
    const eventProfile = {
      goal: 'Find clinics that opened a new location in the last 60 days',
      industry: 'Dental clinics',
      targetAudience: 'Dental practices and clinics with newly opened locations',
      geographicFocus: 'United States',
      researchFocus: 'Grand openings, newly opened clinic branches in the last 60 days',
      clientServiceSummary: 'Local SEO and patient acquisition for new dental locations',
      maxLeads: 3,
      targetCompanies: [],
    };

    it('Agent 1 must preserve the event requirement and time window', async () => {
      const explicitDays = inferExplicitWindowDays(eventProfile);
      assert.equal(explicitDays, 60, 'inferExplicitWindowDays should detect 60 days');

      const fallbackSpec = buildFallbackSpec(eventProfile, explicitDays);
      assert.equal(fallbackSpec.searchMode, 'event', 'Fallback searchMode must be event');
      assert.equal(fallbackSpec.temporalConstraint.required, true, 'Temporal constraint must be required');
      assert.equal(fallbackSpec.temporalConstraint.withinDays, 60);
      assert.equal(fallbackSpec.signalRequirements[0].evidenceType, 'dated_event');
    });

    it('Agent 2 must generate event searches for dated-event campaigns', () => {
      const plan = buildPlan(eventProfile);
      assert.equal(plan.eventRequired, true, 'eventRequired must be true');
      assert.equal(plan.windowDays, 60, 'windowDays must be 60');

      const queue = buildQueue(plan);
      const hasEventTerm = queue.some((q) => /open|opening|newly|inaugurat/i.test(q));
      assert.ok(hasEventTerm, 'Queue must include event queries');
    });

    it('Out-of-window events must not be marked as verified recent events', () => {
      const plan = buildPlan(eventProfile);
      const staleEvidence = {
        signalId: 'recent_event',
        quoteOk: true,
        quote: 'Opened our brand new clinic on January 15, 2021', // Stale date
        url: 'https://news.com/article',
        eventDate: '2021-01-15',
      };
      const candidate = {
        companyName: 'Smile Dental',
        evidence: [staleEvidence],
      };

      const signals = evaluateSignals(candidate, plan, '', ['smile', 'dental']);
      assert.equal(signals.status, 'stale', 'Out of window event must be marked stale');
    });
  });

  /* =========================================================================
     TEST 3: Geography
     ========================================================================= */
  describe('Test 3 — Geography Evaluation', () => {
    const usGeo = discoveryInternals.parseGeo('United States');
    const specificGeo = discoveryInternals.parseGeo('Austin, Texas');

    it('Confirmed country match via state name, city, or explicit country text', () => {
      const result1 = evaluateGeography(usGeo, 'Headquartered in San Francisco, California. Welcome to our SaaS app.', 'app.com');
      assert.equal(result1.status, 'match', 'Should match via California / San Francisco');

      const result2 = evaluateGeography(usGeo, 'Best cloud platform in the United States.', 'cloud.com');
      assert.equal(result2.status, 'match', 'Should match via United States');

      const result3 = evaluateGeography(usGeo, 'Offices in New York, NY 10001', 'nyfirm.com');
      assert.equal(result3.status, 'match', 'Should match via New York');
    });

    it('Unverified country is treated as soft gap (unverified), NOT hard mismatch', () => {
      // Company text does not mention US, but is a .com domain with no foreign contradiction
      const result = evaluateGeography(usGeo, 'We provide enterprise workflow automation for finance teams.', 'workflow.com');
      assert.equal(result.status, 'unverified', 'Generic company text should be unverified, not mismatch');
    });

    it('Explicit country mismatch is rejected (foreign TLD or foreign HQ without US)', () => {
      const result1 = evaluateGeography(usGeo, 'Leading software supplier in Germany.', 'software.de');
      assert.equal(result1.status, 'mismatch', 'Foreign TLD (.de) must be a mismatch for US');

      const result2 = evaluateGeography(usGeo, 'Headquartered in London, United Kingdom. We serve European clients.', 'londontech.com');
      assert.equal(result2.status, 'mismatch', 'Foreign HQ with no US connection must be mismatch');
    });

    it('Specific city/state requirements remain strictly enforced', () => {
      const match = evaluateGeography(specificGeo, 'Based in Austin, Texas. Come visit our studio.', 'austinstudio.com');
      assert.equal(match.status, 'match', 'Should match Austin, Texas');

      const noCity = evaluateGeography(specificGeo, 'Based in Chicago, Illinois.', 'chicagostudio.com');
      assert.equal(noCity.status, 'mismatch', 'Missing specific city Austin must be strict mismatch');
    });
  });

  /* =========================================================================
     TEST 4: Official Websites
     ========================================================================= */
  describe('Test 4 — Official Website Resolution & Identity', () => {
    it('Accurately matches distinctive company name and host', () => {
      const tokens = ['figma'];
      const page = {
        title: 'Figma: The Collaborative Interface Design Tool',
        ogTitle: 'Figma',
        siteName: 'Figma',
        metaDesc: 'Design, prototype, and collaborate all in Figma.',
        h1s: ['How teams design together'],
        host: 'figma.com',
        text: 'Figma connects everyone in the design process so teams can deliver better products, faster.',
      };

      const identity = checkIdentity('Figma', tokens, page, 'probe');
      assert.equal(identity.ok, true, 'Figma identity on figma.com must match');
    });

    it('Rejects directory or listicle sites as official domains', () => {
      const directoryPage = {
        title: 'Top 25 B2B Software Companies in USA - Crunchbase',
        ogTitle: 'Directory of B2B companies',
        metaDesc: 'Find top software companies and compare ratings.',
        h1s: ['Browse B2B Companies Directory'],
        text: 'Directory of healthcare and software vendors.',
      };
      const kind = siteSourceKind(directoryPage);
      assert.ok(kind === 'directory_or_database' || kind === 'listicle', 'Must identify as directory or listicle');

      const pureDirectoryPage = {
        title: 'Healthcare Directory and Database Index',
        ogTitle: 'Directory index',
        metaDesc: 'Browse all clinics and companies in our directory.',
        h1s: ['Directory index'],
        text: 'Find a doctor directory and database of clinics.',
      };
      assert.equal(siteSourceKind(pureDirectoryPage), 'directory_or_database');

      const listiclePage = {
        title: 'Top 10 Best SaaS Tools for 2026',
        ogTitle: 'Top 10 list',
        metaDesc: 'Curated list of tools',
        h1s: ['Best Tools'],
        text: 'Here is our ranked list of tools.',
      };
      assert.equal(siteSourceKind(listiclePage), 'listicle');
    });

    it('Generates apex and www domain guesses', () => {
      const guesses = domainGuesses('Cloudsmith', ['us']);
      assert.ok(guesses.includes('cloudsmith.com'));
      assert.ok(guesses.includes('cloudsmith.io'));
    });
  });

  /* =========================================================================
     TEST 5: Product-Page Classifier
     ========================================================================= */
  describe('Test 5 — Product-Page URL Classifier', () => {
    it('Correctly classifies single product detail URLs', () => {
      assert.equal(isProductPageUrl('https://example.com/products/wireless-headphones'), true);
      assert.equal(isProductPageUrl('https://example.com/product/cotton-tshirt'), true);
      assert.equal(isProductPageUrl('https://example.com/product/cotton-tshirt/'), true); // trailing slash
      assert.equal(isProductPageUrl('https://example.com/p/item-12345'), true);
      assert.equal(isProductPageUrl('https://example.com/items/leather-wallet'), true);
      assert.equal(isProductPageUrl('https://example.com/en/products/running-shoes'), true); // localized
      assert.equal(isProductPageUrl('https://example.com/en-us/product/smart-watch'), true);
    });

    it('Rejects blog articles containing "product" and category pages', () => {
      assert.equal(isProductPageUrl('https://www.grammarly.com/blog/product/'), false, 'Blog post must NOT be product page');
      assert.equal(isProductPageUrl('https://example.com/blog/how-to-write-product-descriptions'), false);
      assert.equal(isProductPageUrl('https://example.com/category/electronics'), false);
      assert.equal(isProductPageUrl('https://example.com/collections/all'), false);
      assert.equal(isProductPageUrl('https://example.com/products'), false, 'Root catalog must not be product page');
      assert.equal(isProductPageUrl('https://example.com/products/all'), false);
    });

    it('Correctly classifies category and collection pages', () => {
      assert.equal(isCategoryPageUrl('https://example.com/collections/summer-sale'), true);
      assert.equal(isCategoryPageUrl('https://example.com/category/shoes'), true);
      assert.equal(isCategoryPageUrl('https://example.com/catalog'), true);
      assert.equal(isCategoryPageUrl('https://example.com/blog/product/'), false);
    });
  });

  /* =========================================================================
     TEST 6: Need-Check Findings
     ========================================================================= */
  describe('Test 6 — Need-Check Findings & Substantive Content', () => {
    it('Detects substantive product description from JSON-LD schema', () => {
      const html = `
        <html><body>
          <h1>Modern Chair</h1>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Modern Ergonomic Chair",
            "description": "Crafted with breathable mesh, adjustable lumbar support, and 3D armrests for all-day comfort and posture."
          }
          </script>
        </body></html>
      `;
      const page = parsePage(html, 'https://store.com/products/modern-chair');
      const hasContent = hasSubstantiveProductDescription(page);
      assert.equal(hasContent, true, 'JSON-LD product description should be recognized as substantive');
    });

    it('Detects substantive product description in text containers without relying on single selector', () => {
      const html = `
        <html><body>
          <main class="product-wrapper">
            <h1>Wireless Speaker</h1>
            <article>
              <p>Experience crystal clear acoustic sound with dual passive radiators and up to 24 hours of continuous battery playtime on a single USB-C charge.</p>
            </article>
          </main>
        </body></html>
      `;
      const page = parsePage(html, 'https://store.com/products/speaker');
      const hasContent = hasSubstantiveProductDescription(page);
      assert.equal(hasContent, true, 'Article paragraph text should be recognized as substantive');
    });

    it('Correctly identifies missing product description when page is empty of details', () => {
      const html = `
        <html><body>
          <h1>Minimal Tee</h1>
          <div class="price">$25.00</div>
          <button>Add to Cart</button>
        </body></html>
      `;
      const page = parsePage(html, 'https://store.com/products/minimal-tee');
      const hasContent = hasSubstantiveProductDescription(page);
      assert.equal(hasContent, false, 'Product page with only title and price has no substantive description');
    });

    it('Reports unavailable tests transparently when scoped pages are not discovered', async () => {
      // Mock site with only homepage and about page (no product pages)
      const site = {
        ok: true,
        host: 'b2bsaas.com',
        siteUrl: 'https://b2bsaas.com',
        pages: [
          parsePage('<html><head><title>SaaS</title><meta name="description" content="Cloud software"></head><body><h1>Welcome</h1></body></html>', 'https://b2bsaas.com'),
          parsePage('<html><head><title>About</title></head><body><h1>About Us</h1><p>We build tools.</p></body></html>', 'https://b2bsaas.com/about'),
        ],
      };

      const productTest = {
        id: 'product_description_sections_missing',
        claim: 'recognizable product description sections',
        kind: 'absent',
        anyText: [],
        anySelector: ['.product-description'],
        scope: 'product_pages',
      };

      const finding = judge(productTest, site);
      assert.equal(finding, null, 'No finding should be invented when product pages are absent');
    });
  });

  /* =========================================================================
     TEST 7: Service-Specific Check Generation
     ========================================================================= */
  describe('Test 7 — Service-Specific Check Generation', () => {
    it('SaaS website redesign campaign does NOT generate e-commerce product copywriting tests', () => {
      const saasProfile = {
        clientServiceSummary: 'Website redesign, UI/UX improvements, conversion-focused website development for B2B SaaS',
      };
      const tests = fallbackNeedTests(saasProfile);

      const hasProductCopyTest = tests.some((t) => t.id.includes('product_description') || t.scope === 'product_pages');
      assert.equal(hasProductCopyTest, false, 'Website redesign must not generate product-page copywriting tests');

      const hasMetaDesc = tests.some((t) => t.id === 'seo_meta_description_missing');
      assert.equal(hasMetaDesc, true, 'Website redesign should include standard meta description check');
    });

    it('E-commerce copywriting campaign DOES generate product and category tests', () => {
      const ecomProfile = {
        clientServiceSummary: 'E-commerce product descriptions, collection copywriting, and product page writing for Shopify stores',
      };
      const tests = fallbackNeedTests(ecomProfile);

      const hasProductTest = tests.some((t) => t.id === 'product_description_sections_missing');
      const hasCategoryTest = tests.some((t) => t.id === 'category_description_sections_missing');
      assert.equal(hasProductTest, true, 'E-commerce copywriting must generate product description test');
      assert.equal(hasCategoryTest, true, 'E-commerce copywriting must generate category description test');
    });
  });

  /* =========================================================================
     TEST 8: Query Reformulation
     ========================================================================= */
  describe('Test 8 — Query Reformulation for Website-State Campaign', async () => {
    it('Deterministic query reformulation for website-state campaign does not produce event or copyright queries', () => {
      const redesignProfile = {
        goal: 'Find potential B2B SaaS companies that could benefit from a modern website redesign',
        industry: 'B2B SaaS software companies',
        targetAudience: 'Small to mid-sized B2B SaaS software companies',
        geographicFocus: 'United States',
        researchFocus: 'Companies that need website redesign',
        clientServiceSummary: 'Website redesign, UI/UX improvements, conversion-focused development',
        maxLeads: 3,
        targetCompanies: [],
      };

      const plan = buildPlan(redesignProfile);
      const tried = new Set(['b2b saas software companies united states']);

      const moreQueries = deterministicMoreQueries(plan, tried);
      assert.ok(moreQueries.length > 0, 'Must produce alternative queries');

      for (const q of moreQueries) {
        assert.doesNotMatch(q, /copyright\s*20\d{2}/i, `Reformulated query "${q}" must not contain copyright year`);
        assert.doesNotMatch(q, /\blaunched\b|\bfunding\b|\braised\b|\bseed round\b/i, `Reformulated query "${q}" must not contain dated events`);
      }
    });

    it('LLM query reformulation prompt enforces no-event rule for website-state campaigns', async () => {
      const redesignProfile = {
        goal: 'B2B SaaS website redesign leads',
        industry: 'B2B SaaS',
        targetAudience: 'B2B SaaS companies',
        geographicFocus: 'United States',
        researchFocus: 'Website redesign',
        clientServiceSummary: 'Website redesign and UI/UX',
        maxLeads: 3,
        targetCompanies: [],
      };

      const plan = buildPlan(redesignProfile);
      let capturedPrompt = '';

      setMockGeminiHandler(async ({ prompt }) => {
        capturedPrompt = prompt;
        return {
          queries: [
            'B2B SaaS software products United States',
            'cloud software platforms United States',
            'B2B software providers United States',
          ],
        };
      });

      const tried = new Set(['b2b saas united states']);
      const queries = await proposeMoreQueries(plan, tried, { insufficient_company_evidence: 5 }, ['Top SaaS Companies']);

      clearMockGeminiHandler();

      assert.ok(capturedPrompt.includes('NO DATED EVENT IS REQUIRED'), 'Prompt must instruct model that no event is required');
      assert.ok(capturedPrompt.includes('DO NOT search for events'), 'Prompt must instruct model not to search for events');
      assert.equal(queries.length, 3);
    });
  });

  /* =========================================================================
     TEST 9: Company Name & Brand Extraction Resolution
     ========================================================================= */
  describe('Test 9 — Company Name & Brand Extraction Resolution', () => {
    const { cleanBusinessName, extractBrandFromItem } = discoveryInternals;

    it('Strips pricing and page-type suffix when host brand matches', () => {
      const cleanName = cleanBusinessName('SSOJet Pricing', 'ssojet.com');
      assert.equal(cleanName, 'SSOJet');
    });

    it('Extracts real brand name from split title when left part is CTA/headline', () => {
      const brand1 = extractBrandFromItem({
        title: 'B2B Ecommerce Demo | Cloudfy',
        host: 'cloudfy.com',
      });
      assert.equal(brand1, 'Cloudfy');

      const brand2 = extractBrandFromItem({
        title: 'Book a Demo | B2BE',
        host: 'b2be.com',
      });
      assert.equal(brand2, 'B2BE');

      const brand3 = extractBrandFromItem({
        title: 'Cloud Services for Small Business | Cortavo',
        host: 'cortavo.com',
      });
      assert.equal(brand3, 'Cortavo');

      const brand4 = extractBrandFromItem({
        title: 'B2B Ecommerce for Distributors - SimplyDepo',
        host: 'simplydepo.com',
      });
      assert.equal(brand4, 'SimplyDepo');
    });

    it('Rejects CTA phrases and generic service headlines as business names', () => {
      const { nameSanity } = discoveryInternals;
      const fakeSpec = { targetText: 'b2b saas software', entityType: 'company' };

      assert.notEqual(nameSanity('Book a Demo', fakeSpec), null);
      assert.notEqual(nameSanity('B2B Ecommerce Demo', fakeSpec), null);
      assert.notEqual(nameSanity('Cloud Services for Small Business', fakeSpec), null);
      assert.notEqual(nameSanity('B2B Ecommerce for Distributors', fakeSpec), null);
      assert.equal(nameSanity('SparkLayer', fakeSpec), null);
      assert.equal(nameSanity('Cloudfy', fakeSpec), null);
    });
  });

  /* =========================================================================
     TEST 10: Best-Practice Check Sanitization & SMB Giant Filtering
     ========================================================================= */
  describe('Test 10 — Best-Practice Check Sanitization & SMB Giant Filtering', () => {
    it('Sanitizes viewport and meta-description tests so kind is strictly "absent"', () => {
      const rawSpec = {
        targetCompanyType: 'B2B SaaS software companies',
        targetDefinition: 'Small and medium-sized B2B SaaS companies',
        needTests: [
          {
            id: 'viewport_check',
            claim: 'Website has a mobile viewport meta tag',
            kind: 'present',
            anySelector: ["meta[name='viewport']"],
            scope: 'home',
          },
          {
            id: 'meta_description_check',
            claim: 'Website has a meta description tag',
            kind: 'present',
            anySelector: ["meta[name='description']"],
            scope: 'home',
          },
        ],
      };

      const normalized = normalizeSpec(rawSpec, {
        industry: 'B2B SaaS',
        targetAudience: 'Small to medium B2B SaaS companies',
        goal: 'Website redesign',
      });

      const viewportTest = normalized.needTests.find((t) => t.id === 'viewport_check');
      const metaTest = normalized.needTests.find((t) => t.id === 'meta_description_check');

      assert.ok(viewportTest, 'viewport_check must exist');
      assert.equal(viewportTest.kind, 'absent', 'viewport_check kind must be flipped to absent');
      assert.ok(metaTest, 'meta_description_check must exist');
      assert.equal(metaTest.kind, 'absent', 'meta_description_check kind must be flipped to absent');
    });

    it('Rejects known enterprise tech giants when campaign targets SMB SaaS', async () => {
      const { evaluateCandidate } = discoveryInternals;
      const smbPlan = buildPlan({
        industry: 'B2B SaaS',
        targetAudience: 'Small and medium-sized B2B SaaS companies',
        goal: 'Website redesign',
      });

      const mondayCandidate = {
        companyName: 'monday.com',
        hostHints: new Map([['monday.com', { host: 'monday.com' }]]),
        profileUrls: new Set(),
        evidence: [],
      };

      const res = await evaluateCandidate(mondayCandidate, smbPlan, { pageCache: new Map() });
      assert.equal(res.ok, false, 'monday.com must be rejected for SMB campaign');
      assert.equal(res.reason, 'wrong_size', 'Rejection reason must be wrong_size');
    });
  });

});
