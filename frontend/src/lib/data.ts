/**
 * Server-side data fetching for Dashboard
 * Uses Next.js async components with real API data
 */

import { api, Allowance, Invoice, Subscription, Transaction, AgentSummary } from './api';

const AGENT_ID = process.env.AGENT_ID || 'tranquility';

export async function getDashboardData(): Promise<{
  allowances: Allowance[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  transactions: Transaction[];
  summary: AgentSummary | null;
  error?: string;
}> {
  try {
    // Check API health first
    await api.healthCheck();

    // Fetch all data in parallel
    const [allowancesRes, invoicesRes, subscriptionsRes, transactionsRes, summary] = await Promise.all([
      api.getAllowances(),
      api.getInvoices(),
      api.getSubscriptions(),
      api.getTransactions(10),
      api.getAgentSummary(AGENT_ID).catch(() => null), // May not exist yet
    ]);

    return {
      allowances: allowancesRes.data || [],
      invoices: invoicesRes.data || [],
      subscriptions: subscriptionsRes.data || [],
      transactions: transactionsRes.data || [],
      summary,
    };
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    return {
      allowances: [],
      invoices: [],
      subscriptions: [],
      transactions: [],
      summary: null,
      error: error instanceof Error ? error.message : 'Failed to fetch data',
    };
  }
}

export async function getStats(): Promise<{
  totalAllowances: number;
  pendingInvoices: number;
  activeSubscriptions: number;
  totalSpent: number;
  error?: string;
}> {
  try {
    const [allowancesRes, invoicesRes, subscriptionsRes] = await Promise.all([
      api.getAllowances(),
      api.getInvoices({ status: 'sent' }),
      api.getSubscriptions({ status: 'active' }),
    ]);

    const allowances = allowancesRes.data || [];
    const invoices = invoicesRes.data || [];
    const subscriptions = subscriptionsRes.data || [];

    const totalSpent = allowances.reduce((sum, a) => sum + (a.spentToday || 0), 0);

    return {
      totalAllowances: allowances.length,
      pendingInvoices: invoices.length,
      activeSubscriptions: subscriptions.length,
      totalSpent,
    };
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return {
      totalAllowances: 0,
      pendingInvoices: 0,
      activeSubscriptions: 0,
      totalSpent: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
    };
  }
}
