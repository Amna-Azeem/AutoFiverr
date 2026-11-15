/**
 * @file evidenceVerificationAgent.js
 * Agent 5 — Evidence Verification
 *
 * Re-runs each need check against the LIVE site (cache bypassed). Evidence that does not
 * reproduce is dropped. There is no "looks fine, accept it anyway" path any more.
 */

import { emitAgentLog } from '../utils/liveLog.js';
import { verifyNeedEvidence } from './needCheckEngine.js';
import { verifyWebEvidence } from './webEvidenceAgent.js';

const AGENT_NAME = 'EvidenceVerification';
const LIVE_LABEL = 'Evidence Verification';

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: AGENT_NAME, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  emitAgentLog(LIVE_LABEL, level, message, meta);
}

export async function runEvidenceVerification(input) {
  const startedAt = Date.now();
  const companyName = input?.companyName;
  const evidenceList = Array.isArray(input?.relevantEvidence) ? input.relevantEvidence : [];

  log('info', 'Agent started: Verifying evidence truthfulness', { company: companyName, items: evidenceList.length });

  const verifiedEvidence = [];
  const rejected = [];

  for (const item of evidenceList) {
    if (!item?.sourceUrl || !String(item.excerpt ?? '').trim()) {
      rejected.push({ reason: 'missing source or excerpt' });
      continue;
    }

    if (item.sourceType === 'web_source') {
      const res = await verifyWebEvidence(item, companyName);
      if (res.verified) {
        verifiedEvidence.push({
          ...item,
          verified: true,
          verificationMethod: res.method,
          sourceCheck: res.method,
          verifiedAt: new Date().toISOString(),
        });
      } else {
        rejected.push({ reason: res.reason || 'did not verify' });
      }
      continue;
    }

    if (item.sourceType !== 'need_check') {
      rejected.push({ reason: 'not a verifiable evidence type' });
      continue;
    }

    let res;
    try {
      res = await verifyNeedEvidence(item);
    } catch (error) {
      res = { verified: false, reason: error?.message || 'verification error' };
    }

    if (res?.verified) {
      verifiedEvidence.push({
        ...item,
        verified: true,
        verificationMethod: 'live_need_check',
        verifiedAt: new Date().toISOString(),
      });
    } else {
      rejected.push({ reason: res?.reason || 'did not reproduce' });
    }
  }

  if (!verifiedEvidence.length) {
    return {
      status: 'discarded',
      output: null,
      reason: `Evidence could not be verified against the live source${rejected[0]?.reason ? ` (${rejected[0].reason})` : ''}.`,
    };
  }

  log('success', 'Evidence verified successfully', { company: companyName, count: verifiedEvidence.length });

  return {
    status: 'success',
    output: { companyName, website: input.website || null, verifiedEvidence, profiles: input.profiles || {}, place: input.place || null },
    metrics: { verifiedCount: verifiedEvidence.length, rejectedCount: rejected.length, durationMs: Date.now() - startedAt },
  };
}

export default runEvidenceVerification;
