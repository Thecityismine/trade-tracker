import Anthropic from '@anthropic-ai/sdk';
import { withAuth } from './_auth.js';

const client = new Anthropic();

const MAX_CHARTS = 6;

const SYSTEM_PROMPT = `You are a trading coach reviewing chart screenshots from a trader's completed trades. You are direct and critical.

Each screenshot was captured AFTER the trade was closed, so the full trade is visible on the chart — the setup that preceded entry, and the price action that followed the exit. Use both.

For each chart, judge two things separately:
1. SETUP — was this a location worth entering? Look at trend direction, market structure, where the entry sat relative to obvious support/resistance or the range, and whether the stop was placed somewhere structurally sensible or at an arbitrary distance.
2. EXECUTION — given what the chart shows after entry, was the exit right? Called out specifically: exiting into continuation (left money on the table), holding through an obvious invalidation, or a stop placed where it was always likely to be swept.

RULES
- Be concrete about what you see on the chart. "You shorted into a higher-low structure with no break of the trendline" is useful. "The setup could have been better" is not.
- If a screenshot is unreadable, cropped too tightly to show context, or does not show enough price action to judge, say so plainly in the setup field and mark the verdict "unclear". Do not invent detail you cannot see.
- Do not comment on indicators you cannot positively identify.
- Judge the decision as it would have looked at entry. A good setup that lost is still a good setup; say so.`;

const CHART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chartNotes'],
  properties: {
    chartNotes: {
      type: 'array',
      description: 'One entry per chart provided, in the same order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'setup', 'execution', 'verdict'],
        properties: {
          ref: { type: 'string', description: 'The trade ref this chart belongs to.' },
          setup: { type: 'string', description: 'Was the entry location worth taking? What does the structure show?' },
          execution: { type: 'string', description: 'Was the exit and stop placement right, given what the chart shows after entry?' },
          verdict: { type: 'string', enum: ['good', 'acceptable', 'poor', 'unclear'] }
        }
      }
    }
  }
};

function toImageBlock(chart) {
  if (chart.dataUrl) {
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(chart.dataUrl);
    if (!match) return null;
    return {
      type: 'image',
      source: { type: 'base64', media_type: match[1], data: match[2] }
    };
  }

  if (chart.url && /^https:\/\//i.test(chart.url)) {
    return { type: 'image', source: { type: 'url', url: chart.url } };
  }

  return null;
}

async function handler(req, res) {
  const payload = req.body;
  const charts = Array.isArray(payload?.charts) ? payload.charts.slice(0, MAX_CHARTS) : [];

  if (charts.length === 0) {
    return res.status(400).json({ error: 'No chart images supplied.' });
  }

  const content = [
    {
      type: 'text',
      text: `These are the charts from my trading week: ${payload.weekLabel}. Review each one.`
    }
  ];

  const included = [];
  for (const chart of charts) {
    const imageBlock = toImageBlock(chart);
    if (!imageBlock) continue;
    content.push({ type: 'text', text: `Trade ${chart.ref} — ${chart.summary}` });
    content.push(imageBlock);
    included.push(chart.ref);
  }

  if (included.length === 0) {
    return res.status(400).json({ error: 'None of the chart images could be read.' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: CHART_SCHEMA }
      },
      messages: [{ role: 'user', content }]
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The model declined to review these charts.' });
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      return res.status(502).json({ error: 'Model returned no chart notes.' });
    }

    if (response.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: 'Chart review was cut off before completing. Try again.' });
    }

    const parsed = JSON.parse(text);

    return res.status(200).json({
      chartNotes: parsed.chartNotes || [],
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    });
  } catch (error) {
    console.error('Chart review failed:', error);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'Chart review failed.' });
  }
}

export default withAuth(handler);
