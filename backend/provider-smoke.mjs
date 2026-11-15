import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

async function testGemini() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      contents: 'Say hello in one short sentence.'
    });
    console.log('GEMINI_OK', String(res?.text || '').slice(0, 200));
  } catch (error) {
    console.log('GEMINI_ERR', error?.message || String(error));
  }
}

async function testOpenRouter() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'AutoFiverr'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'user', content: 'Say hello in one short sentence.' }]
      })
    });
    const text = await response.text();
    console.log('OPENROUTER_STATUS', response.status);
    console.log('OPENROUTER_BODY', text.slice(0, 400));
  } catch (error) {
    console.log('OPENROUTER_ERR', error?.message || String(error));
  }
}

async function testGroq() {
  try {
    const response = await fetch('https://api.groq.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
        temperature: 0.2
      })
    });
    const text = await response.text();
    console.log('GROQ_STATUS', response.status);
    console.log('GROQ_BODY', text.slice(0, 400));
  } catch (error) {
    console.log('GROQ_ERR', error?.message || String(error));
  }
}

await testGemini();
await testOpenRouter();
await testGroq();
