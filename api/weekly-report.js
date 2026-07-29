import Anthropic from '@anthropic-ai/sdk';
import { withAuth } from './_auth.js';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a trading performance coach reviewing one week of a single trader's journal. You are direct and critical. Your job is to make them a better trader, not to make them feel good.

TONE
- Losing weeks get a full teardown. Winning weeks get a short confirmation and then scrutiny of whether the process was actually sound or they just got paid for bad habits.
- No praise padding. No hedging language. Say what went wrong plainly.
- Address the trader as "you". Write in short, concrete sentences.
- Never give market predictions or tell them what to trade next. You review behaviour and execution only.

EVIDENCE RULES — these are hard requirements
- Every claim in whatBroke and whatWorked MUST cite the specific trade refs (e.g. "T3", "T7") it is based on. A claim you cannot tie to specific trades does not go in the report.
- Quote or paraphrase the trader's own comments and journal entries when they contradict their actions. Their own words are your strongest evidence.
- The trader has written strategies with explicit rules. When a trade violates a rule they wrote themselves, say so and name the rule. This is the highest-value observation you can make.
- If there are fewer than 3 trades supporting a pattern, do not call it a pattern. Either state it as a single incident, or say the sample is too small. It is correct and useful to return few findings on a quiet week.
- Do NOT draw any conclusion about time of day, hour, or session timing. The timestamps in this data record when the trade was logged, not when it was entered, so any time-based conclusion would be false.
- Do not perform arithmetic on the numbers. The stats block is already computed and correct — reference it, don't recalculate it.

GRADING LAST WEEK'S COMMITMENTS
- If priorCommitments is non-empty, grade each one against what actually happened this week. This is the most important section of the report.
- verdict "kept" = clear evidence they followed it. "broken" = clear evidence they did not, cite the trades. "partial" = followed it some of the time. "no_data" = nothing this week tested it.
- Do not be generous. A commitment followed on four trades and broken on one is "partial", and you name the one.

COMMITMENTS FOR NEXT WEEK
- Give 2 or 3, no more. Each must be a behaviour they control, not an outcome.
- "measurable" must state exactly how next week's report will check it, in terms of data that exists in this journal. Bad: "trade better". Good: "zero trades where the exit price is beyond the stop loss recorded at entry".

GRADE
- Grade the week's process, not its profit. A profitable week of rule-breaking is a C or lower. A disciplined losing week can be a B.`;

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['grade', 'gradeReason', 'headline', 'lastWeekReview', 'whatBroke', 'whatWorked', 'commitments'],
  properties: {
    grade: {
      type: 'string',
      enum: ['A', 'B', 'C', 'D', 'F'],
      description: 'Grade for the process this week, not the profit.'
    },
    gradeReason: {
      type: 'string',
      description: 'One sentence justifying the grade.'
    },
    headline: {
      type: 'string',
      description: 'The single most important thing about this week, in one or two sentences.'
    },
    lastWeekReview: {
      type: 'array',
      description: 'One entry per commitment made in the previous report. Empty array if there were none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['commitment', 'verdict', 'evidence'],
        properties: {
          commitment: { type: 'string' },
          verdict: { type: 'string', enum: ['kept', 'broken', 'partial', 'no_data'] },
          evidence: { type: 'string', description: 'What actually happened, citing trade refs.' }
        }
      }
    },
    whatBroke: {
      type: 'array',
      description: 'Execution and behaviour failures, most damaging first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'detail', 'tradeRefs', 'severity'],
        properties: {
          claim: { type: 'string', description: 'Short statement of the failure.' },
          detail: { type: 'string', description: 'The evidence, including cost in dollars or R where known.' },
          tradeRefs: { type: 'array', items: { type: 'string' } },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] }
        }
      }
    },
    whatWorked: {
      type: 'array',
      description: 'Kept short. Only genuinely repeatable process wins, not lucky outcomes.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'detail', 'tradeRefs'],
        properties: {
          claim: { type: 'string' },
          detail: { type: 'string' },
          tradeRefs: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    commitments: {
      type: 'array',
      description: '2 or 3 behavioural commitments for next week.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['commitment', 'measurable'],
        properties: {
          commitment: { type: 'string' },
          measurable: { type: 'string' }
        }
      }
    }
  }
};

async function handler(req, res) {
  const payload = req.body;

  if (!payload || !Array.isArray(payload.trades) || payload.trades.length === 0) {
    return res.status(400).json({ error: 'No trades in this week to review.' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: REPORT_SCHEMA }
      },
      messages: [
        {
          role: 'user',
          content: `Review my trading week: ${payload.weekLabel}.

Here is everything from that week. Trades are identified by "ref" — cite those refs in your findings.

${JSON.stringify(payload, null, 2)}`
        }
      ]
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The model declined to produce this report.' });
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      return res.status(502).json({ error: 'Model returned no report content.' });
    }

    if (response.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: 'Report was cut off before completing. Try again.' });
    }

    return res.status(200).json({
      report: JSON.parse(text),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    });
  } catch (error) {
    console.error('Weekly report generation failed:', error);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'Report generation failed.' });
  }
}

export default withAuth(handler);
