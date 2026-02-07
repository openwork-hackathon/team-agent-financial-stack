/**
 * API Client for Agent Financial Stack
 * Connects Next.js frontend to Hono backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3300';

interface ApiResponse<T> {
  data: T;
  count?: number;
  limit?: number;
  offset?: number;
}

// Allowance types
export interface Allowance {
  id: string;
  agentId: string;
  dailyLimit: number;
  spentToday: number;
  spentThisMonth: number;
  status: 'active' | 'paused' | 'exceeded';
}

// Invoice types
export interface Invoice {
  id: string;
  issuerId: string;
  recipientId: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'failed';
  createdAt: string;
  description?: string;
}

// Subscription types
export interface Subscription {
  id: string;
  providerId: string;
  subscriberId: string;
  planId: string;
  amount: number;
  interval: 'daily' | 'weekly' | 'monthly';
  nextBillingDate: string;
  status: 'active' | 'paused' | 'cancelled';
}

// Transaction types
export interface Transaction {
  id: string;
  type: 'allowance_spent' | 'invoice_paid' | 'subscription_billed';
  amount: number;
  timestamp: string;
  description?: string;
}

// Agent summary
export interface AgentSummary {
  agentId: string;
  totalAllowances: number;
  totalSpent: number;
  pendingInvoices: number;
  activeSubscriptions: number;
}

// Wallet balance
export interface WalletBalance {
  openwork: string;
  eth: string;
  verified: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Allowances
  async getAllowances(agentId?: string): Promise<ApiResponse<Allowance[]>> {
    const query = agentId ? `?agentId=${agentId}` : '';
    return this.fetch(`/api/allowances${query}`);
  }

  async getAllowance(id: string): Promise<Allowance> {
    return this.fetch(`/api/allowances/${id}`);
  }

  async createAllowance(data: Partial<Allowance>): Promise<Allowance> {
    return this.fetch('/allowances', {
      method: 'POST',
      headers: { 'x-api-key': 'clawd-money-v1' },
      body: JSON.stringify(data),
    });
  }

  // Invoices
  async getInvoices(params?: { issuerId?: string; recipientId?: string; status?: string }): Promise<ApiResponse<Invoice[]>> {
    const query = new URLSearchParams();
    if (params?.issuerId) query.append('issuerId', params.issuerId);
    if (params?.recipientId) query.append('recipientId', params.recipientId);
    if (params?.status) query.append('status', params.status);
    
    return this.fetch(`/api/invoices?${query.toString()}`);
  }

  async getInvoice(id: string): Promise<Invoice> {
    return this.fetch(`/api/invoices/${id}`);
  }

  async createInvoice(data: Partial<Invoice>): Promise<Invoice> {
    return this.fetch('/invoices', {
      method: 'POST',
      headers: { 'x-api-key': 'clawd-money-v1' },
      body: JSON.stringify(data),
    });
  }

  async sendInvoice(id: string): Promise<void> {
    return this.fetch(`/invoices/${id}/send`, {
      method: 'POST',
      headers: { 'x-api-key': 'clawd-money-v1' },
    });
  }

  async payInvoice(invoiceId: string, transactionHash: string): Promise<void> {
    return this.fetch('/invoices/pay', {
      method: 'POST',
      headers: { 'x-api-key': 'clawd-money-v1' },
      body: JSON.stringify({ invoiceId, transactionHash }),
    });
  }

  // Subscriptions
  async getSubscriptions(params?: { subscriberId?: string; providerId?: string; status?: string }): Promise<ApiResponse<Subscription[]>> {
    const query = new URLSearchParams();
    if (params?.subscriberId) query.append('subscriberId', params.subscriberId);
    if (params?.providerId) query.append('providerId', params.providerId);
    if (params?.status) query.append('status', params.status);
    
    return this.fetch(`/api/subscriptions?${query.toString()}`);
  }

  async getSubscription(id: string): Promise<Subscription> {
    return this.fetch(`/api/subscriptions/${id}`);
  }

  async createSubscription(data: Partial<Subscription>): Promise<Subscription> {
    return this.fetch('/subscriptions', {
      method: 'POST',
      headers: { 'x-api-key': 'clawd-money-v1' },
      body: JSON.stringify(data),
    });
  }

  // Transactions
  async getTransactions(limit: number = 20): Promise<ApiResponse<Transaction[]>> {
    return this.fetch(`/api/transactions?limit=${limit}`);
  }

  // Agent Summary
  async getAgentSummary(agentId: string): Promise<AgentSummary> {
    return this.fetch(`/api/agents/${agentId}/summary`);
  }

  // Wallet
  async getWalletBalance(address: string): Promise<WalletBalance> {
    return this.fetch(`/api/wallet/${address}/balance`);
  }

  async verifyWalletBalance(address: string): Promise<{ verified: boolean; balance: string }> {
    return this.fetch(`/api/wallet/${address}/verify`);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.fetch('/api/health');
  }
}

export const api = new ApiClient();
export default api;
