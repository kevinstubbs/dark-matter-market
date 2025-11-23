'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TimeSeriesDataPoint {
  timestamp: string;
  date: string;
  messages: number;
  delegations: number;
  votes: number;
}

interface TopicChartProps {
  topicId: string;
}

type TimePeriod = '90days' | '1year' | 'all';

export function TopicChart({ topicId }: TopicChartProps) {
  const [data, setData] = useState<TimeSeriesDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');

  useEffect(() => {
    async function fetchTimeSeries() {
      try {
        setLoading(true);
        const response = await fetch(`/api/topics/${topicId}/messages?timeseries=true`);

        if (!response.ok) {
          throw new Error(`Failed to fetch time series: ${response.status}`);
        }

        const result = await response.json();
        setData(result.timeSeries || []);
      } catch (err) {
        console.error('Error fetching time series:', err);
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    if (topicId) {
      fetchTimeSeries();
    }
  }, [topicId]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-500">
        Loading chart...
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  // Filter data based on selected time period
  const now = new Date();
  let filteredData = data;
  
  if (timePeriod === '90days') {
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    filteredData = data.filter(point => new Date(point.date) >= ninetyDaysAgo);
  } else if (timePeriod === '1year') {
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    filteredData = data.filter(point => new Date(point.date) >= oneYearAgo);
  }
  // 'all' uses all data, no filtering needed

  // Format data for chart - sample data points if there are too many
  const maxDataPoints = 100;
  let chartData = filteredData;
  
  if (filteredData.length > maxDataPoints) {
    const step = Math.ceil(filteredData.length / maxDataPoints);
    chartData = filteredData.filter((_, index) => index % step === 0 || index === filteredData.length - 1);
  }

  // Format dates for display and handle zero values for log scale
  // For log scale, we need values > 0, so we'll use 0.1 as minimum for display
  const formattedData = chartData.map((point) => {
    const date = new Date(point.date);
    // Format as MM/DD/YY (e.g., "10/20/25")
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const displayDate = `${month}/${day}/${year}`;
    
    return {
      ...point,
      displayDate,
      // Store original values for tooltip
      originalDelegations: point.delegations,
      originalVotes: point.votes,
      // Use 0.1 instead of 0 for log scale (log(0) is undefined)
      delegations: point.delegations === 0 ? 0.1 : point.delegations,
      votes: point.votes === 0 ? 0.1 : point.votes,
    };
  });

  // Calculate domain for log scale
  const allDelegations = formattedData.map(d => d.delegations);
  const allVotes = formattedData.map(d => d.votes);
  const allValues = [...allDelegations, ...allVotes].filter(v => v > 0);
  
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0.1;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  
  // Set domain for log scale (must be > 0)
  // Use a minimum of 0.1 and pad the max value
  const domainMin = 0.1;
  const domainMax = maxValue * 1.2;

  return (
    <div className="w-full mt-4">
      {/* Time period filter buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTimePeriod('all')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            timePeriod === 'all'
              ? 'bg-zinc-800 dark:bg-zinc-700 text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setTimePeriod('1year')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            timePeriod === '1year'
              ? 'bg-zinc-800 dark:bg-zinc-700 text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          1 Year
        </button>
        <button
          onClick={() => setTimePeriod('90days')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            timePeriod === '90days'
              ? 'bg-zinc-800 dark:bg-zinc-700 text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          Last 90 Days
        </button>
      </div>
      
      {filteredData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-500">
          No data available for selected time period
        </div>
      ) : allValues.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-500">
          No data available
        </div>
      ) : (
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-300 dark:stroke-zinc-700" />
          <XAxis 
            dataKey="displayDate" 
            className="text-xs fill-zinc-600 dark:fill-zinc-400"
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            className="text-xs fill-zinc-600 dark:fill-zinc-400" 
            scale="log"
            domain={[domainMin, domainMax]}
            allowDataOverflow={false}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'rgb(39 39 42)',
              border: '1px solid rgb(63 63 70)',
              borderRadius: '0.5rem',
            }}
            labelStyle={{ color: 'rgb(244 244 245)' }}
            formatter={(value: number, name: string, props: any) => {
              // Show original value from the data point
              if (name === 'Delegations') {
                return props.payload.originalDelegations.toLocaleString();
              } else if (name === 'Votes') {
                return props.payload.originalVotes.toLocaleString();
              }
              return value.toLocaleString();
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '1rem' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey="delegations" 
            stroke="rgb(34 197 94)" 
            strokeWidth={2}
            dot={false}
            name="Delegations"
            connectNulls={false}
          />
          <Line 
            type="monotone" 
            dataKey="votes" 
            stroke="rgb(239 68 68)" 
            strokeWidth={2}
            dot={false}
            name="Votes"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

