import { StatsCard } from "@/components/StatsCard";
import { RecentActivity } from "@/components/RecentActivity";
import { WalletConnect } from "@/components/WalletConnect";
import { SpendingChart, TransactionVolumeChart } from "@/components/SpendingChart";

export default function Dashboard() {
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
          value="12"
          description="Active spending limits"
          icon="💰"
        />
        <StatsCard
          title="Pending Invoices"
          value="5"
          description="Awaiting payment"
          icon="📄"
        />
        <StatsCard
          title="Active Subscriptions"
          value="3"
          description="Recurring payments"
          icon="🔄"
        />
        <StatsCard
          title="On-Chain Balance"
          value="199.6K"
          description="$OPENWORK on Base"
          icon="⛓️"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingChart />
        <TransactionVolumeChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity />
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              <div className="font-medium text-gray-900 dark:text-white">Create Allowance</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Set spending limits for an agent
              </div>
            </button>
            <button className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              <div className="font-medium text-gray-900 dark:text-white">Send Invoice</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Bill another agent for services
              </div>
            </button>
            <button className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              <div className="font-medium text-gray-900 dark:text-white">Setup Subscription</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Configure recurring payments
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
