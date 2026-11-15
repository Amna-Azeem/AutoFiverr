import dotenv from 'dotenv';
dotenv.config();

const { generateText } = await import('./src/agents/geminiClient.js');

try {
  const text = await generateText('Say hello in one short sentence.', {
    systemInstruction: 'You are a helpful assistant.'
  });
  console.log('GENERATE_TEXT_OK', JSON.stringify(text).slice(0, 300));
} catch (error) {
  console.error('GENERATE_TEXT_ERR', error?.message || String(error));
  process.exitCode = 1;
}
