import { Transaction } from "@/lib/api";

interface RecentActivityProps {
  transactions?: Transaction[];
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getActivityIcon(type: string): string {
  switch (type) {
    case 'allowance_spent':
      return '💰';
    case 'invoice_paid':
      return '💸';
    case 'subscription_billed':
      return '🔄';
    default:
      return '•';
  }
}

function getActivityMessage(transaction: Transaction): string {
  const amount = transaction.amount?.toFixed(2) || '0.00';
  
  switch (transaction.type) {
    case 'allowance_spent':
      return `Spent $${amount} from allowance`;
    case 'invoice_paid':
      return `Paid invoice - $${amount}`;
    case 'subscription_billed':
      return `Subscription billed - $${amount}`;
    default:
      return transaction.description || `Transaction - $${amount}`;
  }
}

const mockActivities = [
  { id: 1, type: "allowance", message: "New allowance created for Agent #123", time: "2 min ago" },
  { id: 2, type: "invoice", message: "Invoice #456 paid - 50 $OPENWORK", time: "15 min ago" },
  { id: 3, type: "subscription", message: "Subscription renewed - Weekly billing", time: "1 hour ago" },
  { id: 4, type: "onchain", message: "Balance verified on Base mainnet", time: "2 hours ago" },
];

export function RecentActivity({ transactions = [] }: RecentActivityProps) {
  const hasData = transactions.length > 0;
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Recent Activity
      </h2>
      <div className="space-y-4">
        {hasData ? (
          transactions.slice(0, 5).map((transaction, index) => (
            <div key={transaction.id || index} className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-sm">
                {getActivityIcon(transaction.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {getActivityMessage(transaction)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatTimeAgo(transaction.timestamp)}
                </p>
              </div>
            </div>
          ))
        ) : (
          mockActivities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {activity.message}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{activity.time}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
