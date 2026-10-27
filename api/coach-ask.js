import Anthropic from '@anthropic-ai/sdk';
import { withAuth } from './_auth.js';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are the trading coach inside one trader's personal journal app. They trade Bitcoin perpetuals with leverage. You answer their questions about their own trading using the journal data in the first message: account stats, every closed trade, their written strategies and rules, Playbook entries and risk settings.

How to answer
- Lead with the direct answer in one or two sentences, then the evidence.
- Ground every claim in the data. Cite trades by their ref (e.g. T412) and quote numbers from the stats block rather than recalculating them. When you do need to count or average across trades, say what you counted.
- Say plainly when the data can't answer the question, or when a sample is too small (under about 10 trades) to call a pattern.
- When a trade broke one of their own written rules, name the rule. That is the most useful thing you can tell them.
- Be direct and specific. No padding, no generic trading advice they could read anywhere.
- Never predict the market or tell them what to trade next. You review their behaviour, execution and results.
- Trade timestamps are when the trade was logged, close to the exit — don't draw conclusions about entry timing from them.
- Keep answers short: a few short paragraphs or a tight list. Use Markdown.`;

async function handler(req, res) {
  const { context, history, question } = req.body || {};
  if (!context || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Ask a question.' });
  }

  // Prior turns alternate user/assistant. The journal data rides on the first
  // user turn as its own block, cached, so follow-ups don't resend it at full
  // price.
  const turns = Array.isArray(history) ? history.filter((t) => t && typeof t.text === 'string') : [];
  const all = [...turns, { role: 'user', text: question.trim() }];
  const contextBlock = {
    type: 'text',
    text: `My journal data (JSON):\n${JSON.stringify(context)}`,
    cache_control: { type: 'ephemeral' }
  };
  const messages = all.map((t, i) => (
    i === 0
      ? { role: 'user', content: [contextBlock, { type: 'text', text: t.text }] }
      : { role: t.role === 'assistant' ? 'assistant' : 'user', content: t.text }
  ));

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium' },
      // If a safety classifier declines, the API retries on a fallback model
      // within the same call instead of returning a bare refusal.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The coach declined to answer that one.' });
    }
    const answer = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!answer) return res.status(502).json({ error: 'The coach returned no answer.' });

    return res.status(200).json({
      answer,
      truncated: response.stop_reason === 'max_tokens',
      usage: {
        inputTokens: response.usage.input_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        outputTokens: response.usage.output_tokens
      }
    });
  } catch (error) {
    console.error('Coach question failed:', error);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'The coach could not answer.' });
  }
}

export default withAuth(handler);
