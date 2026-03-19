'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, BarChart3, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrendDataPoint } from '@/types';

interface DashboardChartsProps {
  data?: TrendDataPoint[];
  className?: string;
}

const MOCK_DATA: TrendDataPoint[] = [
  { date: '2026-02-14', findings: 12, resolved: 8, riskScore: 42 },
  { date: '2026-02-15', findings: 18, resolved: 12, riskScore: 55 },
  { date: '2026-02-16', findings: 15, resolved: 20, riskScore: 48 },
  { date: '2026-02-17', findings: 25, resolved: 18, riskScore: 62 },
  { date: '2026-02-18', findings: 22, resolved: 25, riskScore: 58 },
  { date: '2026-02-19', findings: 30, resolved: 22, riskScore: 71 },
  { date: '2026-02-20', findings: 28, resolved: 32, riskScore: 65 },
  { date: '2026-03-01', findings: 35, resolved: 28, riskScore: 78 },
  { date: '2026-03-02', findings: 32, resolved: 38, riskScore: 72 },
  { date: '2026-03-03', findings: 38, resolved: 35, riskScore: 82 },
  { date: '2026-03-04', findings: 42, resolved: 40, riskScore: 75 },
  { date: '2026-03-05', findings: 45, resolved: 42, riskScore: 68 },
  { date: '2026-03-06', findings: 40, resolved: 48, riskScore: 71 },
  { date: '2026-03-07', findings: 38, resolved: 45, riskScore: 65 },
  { date: '2026-03-08', findings: 48, resolved: 50, riskScore: 78 },
  { date: '2026-03-09', findings: 52, resolved: 48, riskScore: 82 },
  { date: '2026-03-10', findings: 55, resolved: 52, riskScore: 75 },
  { date: '2026-03-11', findings: 50, resolved: 58, riskScore: 68 },
  { date: '2026-03-12', findings: 45, resolved: 55, riskScore: 62 },
  { date: '2026-03-13', findings: 52, resolved: 60, riskScore: 70 },
  { date: '2026-03-14', findings: 58, resolved: 55, riskScore: 78 },
  { date: '2026-03-15', findings: 62, resolved: 58, riskScore: 72 },
  { date: '2026-03-16', findings: 68, resolved: 65, riskScore: 78 },
];

const CHART_COLORS = {
  findings: '#f97316',
  resolved: '#10b981',
  riskScore: '#6366f1',
};

export function DashboardCharts({ data, className }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return (data ?? MOCK_DATA).map(d => ({
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [data]);

  return (
    <div className={cn('grid grid-cols-3 gap-4', className)}>
      <div className="bg-white rounded-xl border border-zinc-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Findings Trend</h3>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} stroke="#a1a1aa" />
              <YAxis tick={{ fontSize: 10 }} stroke="#a1a1aa" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="findings"
                stroke={CHART_COLORS.findings}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-zinc-900">New vs Resolved</h3>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(-7)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} stroke="#a1a1aa" />
              <YAxis tick={{ fontSize: 10 }} stroke="#a1a1aa" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="findings" name="New" fill={CHART_COLORS.findings} radius={[4, 4, 0, 0]} />
              <Bar dataKey="resolved" name="Resolved" fill={CHART_COLORS.resolved} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Risk Score</h3>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} stroke="#a1a1aa" />
              <YAxis tick={{ fontSize: 10 }} stroke="#a1a1aa" domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="riskScore"
                stroke={CHART_COLORS.riskScore}
                fill={CHART_COLORS.riskScore}
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}