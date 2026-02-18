import { StatsCard } from "@/components/StatsCard";
import { RecentActivity } from "@/components/RecentActivity";
import { WalletConnect } from "@/components/WalletConnect";
import { SpendingChart, TransactionVolumeChart } from "@/components/SpendingChart";
import { getDashboardData, getStats } from "@/lib/data";

export default async function Dashboard() {
  const [data, stats] = await Promise.all([
    getDashboardData(),
    getStats(),
  ]);

  const { allowances, invoices, subscriptions, transactions, error } = data;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h2 className="text-red-800 dark:text-red-200 font-semibold">API Connection Error</h2>
          <p className="text-red-600 dark:text-red-300 mt-1">{error}</p>
          <p className="text-sm text-red-500 dark:text-red-400 mt-2">
            Make sure the backend server is running on http://localhost:3300
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Financial infrastructure for AI agents
        </div>
      </div>

      <WalletConnect />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Allowances"
          value={stats.totalAllowances.toString()}
          description="Active spending limits"
          icon="💰"
        />
        <StatsCard
          title="Pending Invoices"
          value={stats.pendingInvoices.toString()}
          description="Awaiting payment"
          icon="📄"
        />
        <StatsCard
          title="Active Subscriptions"
          value={stats.activeSubscriptions.toString()}
          description="Recurring payments"
          icon="🔄"
        />
        <StatsCard
          title="Spent Today"
          value={`$${stats.totalSpent.toFixed(2)}`}
          description="Across all agents"
          icon="💸"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingChart allowances={allowances} />
        <TransactionVolumeChart transactions={transactions} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity transactions={transactions} />
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Stats
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">Allowances</span>
              <span className="font-medium text-gray-900 dark:text-white">{allowances.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">Invoices</span>
              <span className="font-medium text-gray-900 dark:text-white">{invoices.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">Subscriptions</span>
              <span className="font-medium text-gray-900 dark:text-white">{subscriptions.length}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600 dark:text-gray-400">Transactions</span>
              <span className="font-medium text-gray-900 dark:text-white">{transactions.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
