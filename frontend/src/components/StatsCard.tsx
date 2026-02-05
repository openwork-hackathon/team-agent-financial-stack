interface StatsCardProps {
  title: string;
  value: string;
  description: string;
  icon: string;
}

export function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}
