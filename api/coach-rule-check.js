import Anthropic from '@anthropic-ai/sdk';
import { withAuth } from './_auth.js';

const client = new Anthropic();

const SYSTEM_PROMPT = `You check one trade from a trader's journal against the rules they wrote themselves: strategy descriptions, notes filed as rules, Playbook "when I see this again" entries and their risk settings. They trade crypto perpetuals (mostly BTC and ETH) with leverage.

- Judge only against the rules provided. Do not invent rules or apply general trading wisdom.
- A violation needs evidence in the trade's own fields (prices, stop, risk, size, notes, emotion, tags). Quote the rule and say what in the trade breaks it.
- If the trade data can't show whether a rule was followed, leave it out rather than guessing — list it under unverifiable only if it matters.
- The trade may carry indicatorsAtEntry: readings from their own charting at the last candle that closed before entry (Skyline regime on the trade's timeframe and 4H, WaveTrend values and last cross, divergence, EMA 5/13/89 ribbon, EMA 200/400, NY session liquidity). These are facts about the chart, not opinions: use them as evidence for any rule that refers to trend, these indicators or sessions. When the trade went against what they show, say so plainly.
- nextTime is one short sentence: the single most useful thing to do differently, or to repeat, on this setup.
- matchedSetup is the strategy or Playbook setup this trade looks like, or null if none fits.
- verdict: "fits" when it matches a written setup with no violations; "breaks" when at least one rule is clearly broken; "partial" when it fits a setup but with minor deviations; "no_match" when it fits none of their written setups; "no_rules" when they have written no rules that apply.
- Be terse and specific.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'matchedSetup', 'summary', 'violations', 'unverifiable', 'nextTime'],
  properties: {
    verdict: { type: 'string', enum: ['fits', 'partial', 'breaks', 'no_match', 'no_rules'] },
    matchedSetup: { type: ['string', 'null'] },
    summary: { type: 'string', description: 'One or two sentences.' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rule', 'evidence'],
        properties: {
          rule: { type: 'string', description: 'The rule, quoted or closely paraphrased.' },
          evidence: { type: 'string', description: 'What in this trade breaks it.' }
        }
      }
    },
    unverifiable: { type: 'array', items: { type: 'string' } },
    nextTime: { type: 'string', description: 'One sentence.' }
  }
};

async function handler(req, res) {
  const { trade, rules } = req.body || {};
  if (!trade || !rules) return res.status(400).json({ error: 'Missing trade or rules.' });

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{
        role: 'user',
        content: `My rules:\n${JSON.stringify(rules)}\n\nThe trade:\n${JSON.stringify(trade)}`
      }]
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The check was declined.' });
    }
    if (response.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: 'The check was cut off. Try again.' });
    }
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'The check returned nothing.' });

    return res.status(200).json({ result: JSON.parse(text) });
  } catch (error) {
    console.error('Rule check failed:', error);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'The rule check failed.' });
  }
}

export default withAuth(handler);
