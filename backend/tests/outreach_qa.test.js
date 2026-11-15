/**
 * @file outreach_qa.test.js
 * Unit tests verifying fixes for False Positive QA Warnings in outreachQualityGateAgent.js
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reviewEmail, runOutreachQa } from '../src/agents/outreachQualityGateAgent.js';

describe('Outreach QA False Positive Regression Tests', () => {
  it('Proper Noun Checker: correctly strips possessive apostrophe-s (e.g., Algolia\'s)', () => {
    const candidate = {
      companyName: 'Algolia',
      website: 'https://algolia.com',
    };
    const evidence = [
      { claim: 'Algolia search API integration and documentation' },
    ];
    const email = {
      subject: 'Inquiry regarding search implementation',
      body: `Hi there,

I am reaching out regarding Algolia's search implementation and technical configuration. Our background focuses on these components and standards. Are you available for a brief conversation discussing this opportunity?

Best regards,`,
    };

    const review = reviewEmail(email, candidate, evidence);
    const weakSupportIssues = review.issues.filter((i) => i.type === 'weak_evidence_support');
    assert.equal(weakSupportIssues.length, 0, `Should not flag Algolia's as ungrounded: ${JSON.stringify(weakSupportIssues)}`);
  });

  it('Number Checker: ignores digit "2" inside "B2B", "Web3", and "OAuth2"', () => {
    const candidate = {
      companyName: 'SparkLayer',
      website: 'https://sparklayer.io',
    };
    const evidence = [
      { claim: 'B2B ordering software platform' },
    ];
    const email = {
      subject: 'B2B platform inquiry',
      body: `Hi there,

I am reaching out to discuss your B2B commerce platform and modern Web3 and OAuth2 foundations. Our team specializes in technical configuration and data insights. Would you have time for a brief conversation regarding this?

Best regards,`,
    };

    const review = reviewEmail(email, candidate, evidence);
    const numberIssues = review.issues.filter((i) => i.type === 'unverified_numbers');
    assert.equal(numberIssues.length, 0, `Should not flag digit from B2B/Web3/OAuth2: ${JSON.stringify(numberIssues)}`);
  });

  it('Allowed Business Correspondence Terms: does not flag standard professional terms', () => {
    const candidate = {
      companyName: 'monday.com',
      website: 'https://monday.com',
    };
    const evidence = [
      { claim: 'Website has a mobile viewport meta tag' },
      { claim: 'Website has a meta description tag' },
    ];
    const email = {
      subject: 'Inquiry regarding monday.com website configuration',
      body: `Hi there,

I am contacting you to discuss the technical configuration of monday.com. I noted that your website currently utilizes a mobile viewport meta tag and a meta description tag. My work focuses on the implementation of these technical elements. I am looking to connect with teams managing these specific website configurations to explain my background. Are you available for a brief conversation regarding this?

Best regards,`,
    };

    const review = reviewEmail(email, candidate, evidence);
    assert.equal(review.passed, true, `Review should pass with 0 issues: ${JSON.stringify(review.issues)}`);
  });

  it('Missing sign-off check works and repairs properly', async () => {
    const candidate = {
      companyName: 'Acme Software',
    };
    const evidence = [
      { claim: 'Acme Cloud platform' },
    ];
    const emailWithoutSignoff = {
      subject: 'Inquiry regarding Acme Software',
      body: `Hi there,

I am contacting you regarding Acme Software. We gathered relevant insights about your technical configuration and would like to discuss this implementation briefly. Would you be open to connecting?`,
    };

    const res = await runOutreachQa({
      email: emailWithoutSignoff,
      candidate,
      evidence,
    });

    assert.ok(res.email.body.includes('Best regards'), 'Repaired email should include a sign-off');
  });
});
