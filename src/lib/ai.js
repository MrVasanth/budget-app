// Asks Claude to read statement text and sort each transaction into a category.
// Only the statement text (with account numbers hidden) is sent, straight from your phone to Anthropic.

export const MODEL = 'claude-haiku-5-5';
const URL_ = 'https://api.anthropic.com/v1/messages';

export class AIError extends Error {
  constructor(message, kind = 'error') {
    super(message);
    this.name = 'AIError';
    this.kind = kind; // 'key' | 'credit' | 'offline' | 'busy' | 'error'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(apiKey, body, signal) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(URL_, {
        method: 'POST',
        signal,
        headers: {
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (signal && signal.aborted) throw e;
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new AIError('Can’t reach Claude. Check your internet connection.', 'offline');
    }
    if (res.ok) return res.json();
    let msg = '';
    try {
      msg = (await res.json()).error?.message || '';
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new AIError('The Claude key isn’t valid. Check it in More → Statement reader.', 'key');
    if (res.status === 403) throw new AIError('This Claude key isn’t allowed to do that. Make a new key and try again.', 'key');
    if (/credit balance/i.test(msg)) throw new AIError('Your Claude account is out of credit. Add credit at console.anthropic.com → Billing, then try again.', 'credit');
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 3) {
      const wait = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(wait * 1000, 2000 * 2 ** attempt));
      continue;
    }
    if ([429, 529].includes(res.status)) throw new AIError('Claude is busy right now. Wait a minute and try again.', 'busy');
    throw new AIError(`Claude couldn’t read this (${res.status}${msg ? ': ' + msg : ''}).`);
  }
  throw new AIError('Claude is busy right now. Wait a minute and try again.', 'busy');
}

/** Cheap check that a key works. */
export async function testKey(apiKey) {
  await call(apiKey, { model: MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with OK' }] });
  return true;
}

function tool(categoryIds) {
  const num = { type: ['number', 'null'] };
  return {
    name: 'record_transactions',
    description: 'Record every transaction found in this part of the statement.',
    input_schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Transaction date as YYYY-MM-DD' },
              payee: { type: 'string', description: 'Short clean name of the merchant or person, in Title Case, e.g. "Swiggy", "Ravi Kumar", "ATM cash withdrawal"' },
              details: { type: 'string', description: 'The original description text as printed, joined into one line, without the date, amount or balance' },
              amount: { type: 'number', description: 'Amount in rupees, always positive' },
              direction: { type: 'string', enum: ['out', 'in'] },
              category: { type: 'string', enum: categoryIds },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              balance: { type: ['number', 'null'], description: 'Running balance printed on this row, or null' },
            },
            required: ['date', 'payee', 'details', 'amount', 'direction', 'category', 'confidence'],
          },
        },
        statement: {
          type: 'object',
          description: 'Totals printed on the statement in this part, null when not shown',
          properties: {
            period_start: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            period_end: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            opening_balance: num,
            closing_balance: num,
            total_debits: num,
            total_credits: num,
          },
        },
      },
      required: ['transactions'],
    },
  };
}

function systemPrompt({ account, accounts, categories, today }) {
  const isCard = account.type === 'card';
  const others = accounts
    .filter((a) => a.id !== account.id && !a.archived)
    .map((a) => `${a.name} (${a.type === 'card' ? 'credit card' : a.type === 'cash' ? 'cash' : 'bank account'})`)
    .join(', ');
  const cats = categories
    .filter((c) => !c.archived)
    .map((c) => `- ${c.id}: ${c.name} [${c.group}]${c.hint ? ' e.g. ' + c.hint : ''}`)
    .join('\n');
  return `You read Indian bank and credit card statements and record each transaction for a personal budgeting app. Today is ${today}.

This statement is for the user's ${isCard ? 'credit card' : 'bank account'} "${account.name}".
The user's other accounts: ${others || 'none'}.

Categories (use the id):
${cats}

How to record:
1. Record every transaction row in the text you are given, exactly once, in the order they appear. Skip opening/closing balance rows, page totals, summaries, reward points, interest rate tables, offers and ads. A description can wrap onto the next line; join it.
2. amount is always positive, in rupees. If a running balance is printed on the row, put it in balance.
3. direction: ${isCard
    ? 'purchases, fees, charges, interest and EMIs are "out"; payments received, refunds, reversals and cashback are "in".'
    : 'withdrawals/debits (Dr) are "out"; deposits/credits (Cr) are "in". Use the running balance to tell them apart when columns are unclear.'}
4. Dates become YYYY-MM-DD. Indian statements use day first (DD/MM/YY, DD-MM-YYYY, 14 Oct 2026). If the year is missing, work it out from the statement period. No date is after today.
5. payee: a short human name. "UPI-RAVI KUMAR-ravikumar99@okhdfcbank-..." → "Ravi Kumar". "SWIGGY*ORDER BANGALORE" → "Swiggy". For NEFT/IMPS/RTGS use the other party's name.
6. Category rules:
   - Paying a credit card bill from a bank account (CRED, BillDesk, "CC payment", a card name) → card_payment.${isCard ? ' On this card statement, "Payment received" / "Thank you for your payment" lines → card_payment.' : ''}
   - Money moved to or from the user's own accounts listed above, and ATM cash withdrawals → self_transfer.
   - Salary → salary. Interest credited, dividends → other_income.
   - Refunds, reversals and cashback from a merchant → the same category as the purchase (Amazon refund → shopping), direction "in".
   - Money received from a person (UPI/IMPS from an individual) → other_income with low confidence; it may be someone paying back their share.
   - Bank charges, GST on charges, card fees, late fees → charges.
7. confidence: high = the merchant or type makes the category obvious; medium = probable; low = unclear (person-to-person payments, vague descriptions, unknown merchants).
8. If the statement prints totals or the period in this part, fill in "statement"; otherwise leave those fields null.

Always answer by calling record_transactions.`;
}

function userContent(chunk, periodHint) {
  const blocks = [];
  const intro = periodHint ? `Statement period: ${periodHint}.\n` : '';
  let text = '';
  for (const p of chunk) {
    if (p.text) text += `\n--- Page ${p.n} ---\n${p.text}\n`;
  }
  for (const p of chunk) {
    if (p.image) {
      blocks.push({ type: 'text', text: `Page ${p.n} (scanned image):` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.image } });
    }
  }
  blocks.unshift({ type: 'text', text: `${intro}Here is part of the statement. Record every transaction in it.${text ? '\n' + text : ''}` });
  return blocks;
}

/** Reads one batch of pages. Returns { transactions, statement }. */
export async function readChunk(apiKey, chunk, ctx, signal) {
  const ids = ctx.categories.filter((c) => !c.archived).map((c) => c.id);
  const body = {
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(ctx),
    tools: [tool(ids)],
    tool_choice: { type: 'tool', name: 'record_transactions' },
    messages: [{ role: 'user', content: userContent(chunk, ctx.periodHint) }],
  };
  const res = await call(apiKey, body, signal);
  if (res.stop_reason === 'max_tokens') {
    const err = new AIError('Too many transactions in one go.', 'too_long');
    throw err;
  }
  const use = (res.content || []).find((b) => b.type === 'tool_use');
  if (!use || !use.input) throw new AIError('Claude didn’t return any transactions for part of this statement.');
  const valid = new Set(ids);
  const txns = (Array.isArray(use.input.transactions) ? use.input.transactions : [])
    .map((t) => ({
      date: String(t.date || '').slice(0, 10),
      payee: String(t.payee || '').trim().slice(0, 80),
      details: String(t.details || '').trim().slice(0, 300),
      amount: Math.abs(Number(t.amount)),
      dir: t.direction === 'in' ? 'in' : 'out',
      category: valid.has(t.category) ? t.category : 'misc',
      confidence: ['high', 'medium', 'low'].includes(t.confidence) ? t.confidence : 'low',
      balance: Number.isFinite(Number(t.balance)) && t.balance !== null && t.balance !== '' ? Number(t.balance) : null,
    }))
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount) && t.amount > 0);
  return { transactions: txns, statement: use.input.statement || {} };
}
