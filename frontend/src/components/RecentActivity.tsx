const activities = [
  { id: 1, type: "allowance", message: "New allowance created for Agent #123", time: "2 min ago" },
  { id: 2, type: "invoice", message: "Invoice #456 paid - 50 $OPENWORK", time: "15 min ago" },
  { id: 3, type: "subscription", message: "Subscription renewed - Weekly billing", time: "1 hour ago" },
  { id: 4, type: "onchain", message: "Balance verified on Base mainnet", time: "2 hours ago" },
];

export function RecentActivity() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Recent Activity
      </h2>
      <div className="space-y-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {activity.message}
              </p>
              <p className="text-sm text-gray-500">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
