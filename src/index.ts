import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { html } from 'hono/html';
import { db } from './db';
import { allowances, invoices, subscriptions, transactions } from './db/schema';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createInvoice, sendInvoice, payInvoice } from './core/ledger';
import { createSubscription, processBilling, processDueSubscriptions } from './core/subscriptions';
import { getOpenworkBalance, getEthBalance, verifyOpenworkBalance, CONTRACTS } from './core/onchain';
import { registerWebhook, unregisterWebhook, getWebhooks } from './core/webhooks';
import { openApiSpec } from './openapi';
import { 
  createAllowanceSchema, 
  updateAllowanceSchema,
  createInvoiceSchema, 
  payInvoiceSchema,
  createSubscriptionSchema,
  paginationSchema,
  agentFilterSchema
} from './validation';

const app = new Hono();

// --- CORS Middleware ---
app.use('*', async (c, next) => {
  // Allow requests from any origin (for development)
  // In production, restrict to your Vercel domain
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
});

// --- Auth Middleware ---
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api') && ['POST', 'PUT', 'DELETE'].includes(c.req.method)) {
    const apiKey = c.req.header('x-api-key');
    if (apiKey !== 'clawd-money-v1') {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }
  await next();
});

// --- Dashboard ---
app.get('/', async (c) => {
  const allAllowances = await db.select().from(allowances).all();
  const allInvoices = await db.select().from(invoices).orderBy(desc(invoices.createdAt)).all();
  const allSubs = await db.select().from(subscriptions).all();
  const allTx = await db.select().from(transactions).orderBy(desc(transactions.timestamp)).limit(20).all();

  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Agent Financial Stack</title>
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
      <style>
        body { font-family: -apple-system, system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem; background: #f4f4f9; color: #333; }
        h1 { color: #222; margin-bottom: 2rem; }
        h2 { border-bottom: 2px solid #ddd; padding-bottom: 0.5rem; margin-top: 2rem; display: flex; justify-content: space-between; align-items: center; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: 600; color: #555; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; }
        tr:hover { background: #f9f9f9; }
        .status-active, .status-paid, .status-success { color: #166534; background: #dcfce7; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; display: inline-block; }
        .status-sent { color: #854d0e; background: #fef9c3; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; display: inline-block; }
        .status-draft { color: #4b5563; background: #f3f4f6; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; display: inline-block; }
        .status-failed { color: #991b1b; background: #fee2e2; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; display: inline-block; }
        button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s; }
        button:hover { background: #2563eb; }
        button:disabled { background: #cbd5e1; cursor: not-allowed; }
        .btn-green { background: #22c55e; }
        .btn-green:hover { background: #16a34a; }
        .empty-state { padding: 2rem; text-align: center; color: #888; background: white; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h1>💸 Agent Financial Stack</h1>
        <div>
          <button class="btn-green" hx-post="/billing/process" hx-swap="none" onClick="alert('Billing process triggered!')">
             Run Billing Cycle 🔄
          </button>
        </div>
      </div>
      
      <h2>🤖 Agent Allowances</h2>
      ${allAllowances.length === 0 ? html`<div class="empty-state">No allowances active</div>` : html`
      <table>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Daily Limit</th>
            <th>Spent (Today)</th>
            <th>Spent (Month)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${allAllowances.map(a => html`
            <tr>
              <td><code>${a.agentId}</code></td>
              <td>$${(a.dailyLimit ?? 0).toFixed(2)}</td>
              <td>$${(a.spentToday || 0).toFixed(2)}</td>
              <td>$${(a.spentThisMonth || 0).toFixed(2)}</td>
              <td><span class="status-${a.status}">${a.status}</span></td>
            </tr>
          `)}
        </tbody>
      </table>
      `}

      <h2>📅 Active Subscriptions</h2>
      ${allSubs.length === 0 ? html`<div class="empty-state">No active subscriptions</div>` : html`
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Subscriber</th>
            <th>Plan</th>
            <th>Amount</th>
            <th>Next Bill</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${allSubs.map(s => html`
            <tr>
              <td><code>${s.providerId}</code></td>
              <td><code>${s.subscriberId}</code></td>
              <td>${s.planId}</td>
              <td>$${s.amount.toFixed(2)} / ${s.interval}</td>
              <td>${new Date(s.nextBillingDate).toLocaleDateString()} ${new Date(s.nextBillingDate).toLocaleTimeString()}</td>
              <td><span class="status-${s.status}">${s.status}</span></td>
            </tr>
          `)}
        </tbody>
      </table>
      `}

      <h2>🧾 Invoices</h2>
      ${allInvoices.length === 0 ? html`<div class="empty-state">No invoices generated</div>` : html`
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>ID</th>
            <th>Issuer</th>
            <th>Recipient</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${allInvoices.map(i => html`
            <tr>
              <td>${new Date(i.createdAt || 0).toLocaleDateString()}</td>
              <td><small>${i.id.substring(0, 8)}...</small></td>
              <td><code>${i.issuerId}</code></td>
              <td><code>${i.recipientId}</code></td>
              <td>$${i.amount.toFixed(2)}</td>
              <td><span class="status-${i.status}">${i.status}</span></td>
              <td>
                ${i.status === 'draft' ? html`
                  <button hx-post="/invoices/${i.id}/send" hx-swap="outerHTML">Send</button>
                ` : ''}
                ${i.status === 'sent' ? html`<span style="color:#888; font-size:0.8rem">Pending Payment</span>` : ''}
              </td>
            </tr>
          `)}
        </tbody>
      </table>
      `}

      <h2>📜 Transaction History (Last 20)</h2>
      ${allTx.length === 0 ? html`<div class="empty-state">No transactions yet</div>` : html`
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Recipient</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${allTx.map(t => html`
            <tr>
              <td>${new Date(t.timestamp || 0).toLocaleString()}</td>
              <td>$${t.amount.toFixed(2)}</td>
              <td>${t.category}</td>
              <td>${t.recipient}</td>
              <td><span class="status-${t.status}">${t.status}</span></td>
            </tr>
          `)}
        </tbody>
      </table>
      `}

      <footer style="margin-top: 3rem; color: #888; font-size: 0.9rem; text-align: center;">
        Agent Financial Stack v1.2 • <a href="/billing/process" style="color: #666">Trigger Billing API</a>
      </footer>
    </body>
    </html>
  `);
});

// ===========================================
// API Routes - GET (Query)
// ===========================================

// --- GET: Allowances ---
app.get('/api/allowances', async (c) => {
  const agentId = c.req.query('agentId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let results;
  
  if (agentId) {
    results = await db.select().from(allowances).where(eq(allowances.agentId, agentId)).limit(limit).offset(offset).all();
  } else if (status) {
    results = await db.select().from(allowances).where(eq(allowances.status, status)).limit(limit).offset(offset).all();
  } else {
    results = await db.select().from(allowances).limit(limit).offset(offset).all();
  }

  return c.json({ data: results, count: results.length, limit, offset });
});

app.get('/api/allowances/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(allowances).where(eq(allowances.id, id)).limit(1).get();
  
  if (!result) return c.json({ error: 'Allowance not found' }, 404);
  return c.json(result);
});

// --- GET: Invoices ---
app.get('/api/invoices', async (c) => {
  const issuerId = c.req.query('issuerId');
  const recipientId = c.req.query('recipientId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let results;
  
  if (issuerId) {
    results = await db.select().from(invoices).where(eq(invoices.issuerId, issuerId)).orderBy(desc(invoices.createdAt)).limit(limit).offset(offset).all();
  } else if (recipientId) {
    results = await db.select().from(invoices).where(eq(invoices.recipientId, recipientId)).orderBy(desc(invoices.createdAt)).limit(limit).offset(offset).all();
  } else if (status) {
    results = await db.select().from(invoices).where(eq(invoices.status, status)).orderBy(desc(invoices.createdAt)).limit(limit).offset(offset).all();
  } else {
    results = await db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit).offset(offset).all();
  }

  return c.json({ data: results, count: results.length, limit, offset });
});

app.get('/api/invoices/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1).get();
  
  if (!result) return c.json({ error: 'Invoice not found' }, 404);
  return c.json(result);
});

// --- GET: Subscriptions ---
app.get('/api/subscriptions', async (c) => {
  const subscriberId = c.req.query('subscriberId');
  const providerId = c.req.query('providerId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let results;
  
  if (subscriberId) {
    results = await db.select().from(subscriptions).where(eq(subscriptions.subscriberId, subscriberId)).limit(limit).offset(offset).all();
  } else if (providerId) {
    results = await db.select().from(subscriptions).where(eq(subscriptions.providerId, providerId)).limit(limit).offset(offset).all();
  } else if (status) {
    results = await db.select().from(subscriptions).where(eq(subscriptions.status, status)).limit(limit).offset(offset).all();
  } else {
    results = await db.select().from(subscriptions).limit(limit).offset(offset).all();
  }

  return c.json({ data: results, count: results.length, limit, offset });
});

app.get('/api/subscriptions/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1).get();
  
  if (!result) return c.json({ error: 'Subscription not found' }, 404);
  return c.json(result);
});

// --- GET: Transactions ---
app.get('/api/transactions', async (c) => {
  const allowanceId = c.req.query('allowanceId');
  const category = c.req.query('category');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let results;
  
  if (allowanceId) {
    results = await db.select().from(transactions).where(eq(transactions.allowanceId, allowanceId)).orderBy(desc(transactions.timestamp)).limit(limit).offset(offset).all();
  } else if (category) {
    results = await db.select().from(transactions).where(eq(transactions.category, category)).orderBy(desc(transactions.timestamp)).limit(limit).offset(offset).all();
  } else {
    results = await db.select().from(transactions).orderBy(desc(transactions.timestamp)).limit(limit).offset(offset).all();
  }

  return c.json({ data: results, count: results.length, limit, offset });
});

// --- GET: Agent Summary (spending overview for an agent) ---
app.get('/api/agents/:agentId/summary', async (c) => {
  const agentId = c.req.param('agentId');
  
  // Get allowance
  const allowance = await db.select().from(allowances).where(eq(allowances.agentId, agentId)).limit(1).get();
  
  // Get active subscriptions count
  const activeSubs = await db.select().from(subscriptions).where(eq(subscriptions.subscriberId, agentId)).all();
  const activeSubsCount = activeSubs.filter(s => s.status === 'active').length;
  
  // Get unpaid invoices
  const unpaidInvoices = await db.select().from(invoices).where(eq(invoices.recipientId, agentId)).all();
  const unpaidCount = unpaidInvoices.filter(i => i.status === 'sent').length;
  const unpaidAmount = unpaidInvoices.filter(i => i.status === 'sent').reduce((sum, i) => sum + i.amount, 0);
  
  // Monthly recurring cost
  const monthlyCost = activeSubs.reduce((sum, s) => {
    if (s.status !== 'active') return sum;
    if (s.interval === 'daily') return sum + (s.amount * 30);
    if (s.interval === 'weekly') return sum + (s.amount * 4);
    return sum + s.amount;
  }, 0);

  return c.json({
    agentId,
    allowance: allowance || null,
    spending: {
      today: allowance?.spentToday || 0,
      thisWeek: allowance?.spentThisWeek || 0,
      thisMonth: allowance?.spentThisMonth || 0,
    },
    limits: {
      daily: allowance?.dailyLimit || 0,
      weekly: allowance?.weeklyLimit || 0,
      monthly: allowance?.monthlyLimit || 0,
    },
    subscriptions: {
      active: activeSubsCount,
      monthlyRecurring: monthlyCost,
    },
    invoices: {
      unpaidCount,
      unpaidAmount,
    },
  });
});

// --- On-chain balance endpoints ---
app.get('/api/wallet/:address/balance', async (c) => {
  const address = c.req.param('address');
  
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return c.json({ error: 'Invalid wallet address' }, 400);
  }

  const [openwork, eth] = await Promise.all([
    getOpenworkBalance(address),
    getEthBalance(address),
  ]);

  return c.json({
    address,
    openwork: {
      balance: openwork.balance,
      balanceRaw: openwork.balanceRaw,
      token: CONTRACTS.OPENWORK_TOKEN,
    },
    eth: {
      balance: eth.balance,
      balanceRaw: eth.balanceRaw,
    },
    chain: 'base',
  });
});

app.get('/api/wallet/:address/verify', async (c) => {
  const address = c.req.param('address');
  const requiredStr = c.req.query('required') || '100000'; // Default 100K for hackathon
  const required = parseFloat(requiredStr);

  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return c.json({ error: 'Invalid wallet address' }, 400);
  }

  const result = await verifyOpenworkBalance(address, required);
  
  return c.json({
    address,
    ...result,
    token: CONTRACTS.OPENWORK_TOKEN,
    chain: 'base',
  });
});

// --- Webhook management ---
app.get('/api/webhooks/:agentId', (c) => {
  const agentId = c.req.param('agentId');
  const webhooks = getWebhooks(agentId);
  return c.json({ agentId, webhooks, count: webhooks.length });
});

app.post('/api/webhooks', async (c) => {
  const body = await c.req.json();
  const { agentId, webhookUrl } = body;

  if (!agentId || !webhookUrl) {
    return c.json({ error: 'Missing agentId or webhookUrl' }, 400);
  }

  // Basic URL validation
  try {
    new URL(webhookUrl);
  } catch {
    return c.json({ error: 'Invalid webhook URL' }, 400);
  }

  registerWebhook(agentId, webhookUrl);
  return c.json({ success: true, agentId, webhookUrl });
});

app.delete('/api/webhooks', async (c) => {
  const body = await c.req.json();
  const { agentId, webhookUrl } = body;

  if (!agentId || !webhookUrl) {
    return c.json({ error: 'Missing agentId or webhookUrl' }, 400);
  }

  unregisterWebhook(agentId, webhookUrl);
  return c.json({ success: true, agentId, webhookUrl });
});

// --- Health check ---
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'agent-financial-stack',
    version: '1.5.0',
    timestamp: new Date().toISOString(),
    contracts: CONTRACTS,
  });
});

// --- OpenAPI spec ---
app.get('/api/openapi.json', (c) => {
  return c.json(openApiSpec);
});

app.get('/api/docs', (c) => {
  // Serve Swagger UI
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Agent Financial Stack API</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
      <script>
        SwaggerUIBundle({
          url: '/api/openapi.json',
          dom_id: '#swagger-ui',
        });
      </script>
    </body>
    </html>
  `);
});

// ===========================================
// API Routes - POST/PATCH (Mutations)
// ===========================================

// --- API: Allowances ---
app.post('/allowances', async (c) => {
  const body = await c.req.json();
  const { agentId, ownerId, dailyLimit } = body;

  if (!agentId || !ownerId) return c.json({ error: 'Missing fields' }, 400);

  const id = uuidv4();
  try {
    await db.insert(allowances).values({
      id,
      agentId,
      ownerId,
      dailyLimit: dailyLimit || 0,
      createdAt: Date.now(),
      status: 'active'
    }).run();
    return c.json({ success: true, allowanceId: id });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Database error' }, 500);
  }
});

// --- API: Invoices ---
app.post('/invoices', async (c) => {
  const body = await c.req.json();
  const { issuerId, recipientId, amount } = body;

  if (!issuerId || !recipientId || !amount) return c.json({ error: 'Missing fields' }, 400);

  const result = await createInvoice(issuerId, recipientId, amount);
  if (result.success) return c.json(result);
  return c.json(result, 500);
});

app.post('/invoices/:id/send', async (c) => {
  const id = c.req.param('id');
  const result = await sendInvoice(id);
  
  // If request from HTMX/Browser, redirect to home to refresh
  if (c.req.header('hx-request')) {
     return c.redirect('/');
  }
  
  if (result.success) return c.json(result);
  return c.json(result, 400);
});

app.post('/invoices/pay', async (c) => {
  const body = await c.req.json();
  const { invoiceId, agentId, allowanceId } = body; 

  if (!invoiceId || !agentId) return c.json({ error: 'Missing fields' }, 400);

  const result = await payInvoice(invoiceId, agentId, allowanceId);
  if (result.success) return c.json(result);
  return c.json(result, 400);
});

// --- API: Subscriptions ---
app.post('/subscriptions', async (c) => {
  const body = await c.req.json();
  const { subscriberId, providerId, planId, amount, interval, allowanceId } = body;

  if (!subscriberId || !providerId || !planId || !amount || !allowanceId) {
    return c.json({ error: 'Missing fields' }, 400);
  }

  const result = await createSubscription(subscriberId, providerId, planId, amount, interval || 'monthly', allowanceId);
  if (result.success) return c.json(result);
  return c.json(result, 500);
});

// --- API: Billing ---
app.post('/billing/process', async (c) => {
  const result = await processDueSubscriptions();
  
  // If HTMX request, we can just return a success message or redirect
  if (c.req.header('hx-request')) {
    // Maybe trigger a reload?
    return c.redirect('/');
  }

  return c.json(result);
});

const port = 3300;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
