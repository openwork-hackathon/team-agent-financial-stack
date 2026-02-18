"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { Allowance, Transaction } from "@/lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SpendingChartProps {
  allowances?: Allowance[];
}

export function SpendingChart({ allowances = [] }: SpendingChartProps) {
  // If no real data, show placeholder
  const hasData = allowances.length > 0;
  
  const data = {
    labels: hasData ? allowances.slice(0, 5).map(a => a.agentId.slice(0, 8)) : ["No Data"],
    datasets: [
      {
        label: "Spent Today",
        data: hasData ? allowances.slice(0, 5).map(a => a.spentToday || 0) : [0],
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Daily Limit",
        data: hasData ? allowances.slice(0, 5).map(a => a.dailyLimit || 0) : [0],
        borderColor: "rgb(239, 68, 68)",
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: hasData ? "Top 5 Agents: Spending vs Limit" : "No Allowance Data",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Spending Trends
      </h3>
      <div className="h-64">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

interface TransactionVolumeChartProps {
  transactions?: Transaction[];
}

export function TransactionVolumeChart({ transactions = [] }: TransactionVolumeChartProps) {
  const hasData = transactions.length > 0;
  
  // Group transactions by type
  const byType: Record<string, number> = {};
  transactions.forEach(t => {
    const type = t.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });
  
  const data = {
    labels: hasData ? Object.keys(byType) : ["No Data"],
    datasets: [
      {
        label: "Transaction Count",
        data: hasData ? Object.values(byType) : [0],
        backgroundColor: [
          "rgba(59, 130, 246, 0.8)",
          "rgba(34, 197, 94, 0.8)",
          "rgba(239, 68, 68, 0.8)",
          "rgba(168, 85, 247, 0.8)",
        ],
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: hasData ? "Transactions by Type" : "No Transaction Data",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Transaction Volume
      </h3>
      <div className="h-64">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
