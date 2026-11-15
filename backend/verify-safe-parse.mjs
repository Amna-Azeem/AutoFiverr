import { safeParseJson } from './src/agents/geminiClient.js';

const raw = '{"CRM setup and optimization to support new enterprise billing workflows on Stripe could reduce complexity and save time for finance teams.":"API integration with the client\'s services to leverage Stripe\'s new API enhancements for finance teams."}';
const parsed = safeParseJson(raw, []);
console.log('TYPE', Array.isArray(parsed), JSON.stringify(parsed));
