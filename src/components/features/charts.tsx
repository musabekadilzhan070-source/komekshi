'use client';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { parseISO, MONTHS_GEN } from '@/lib/date';

export const C = { dark: '#4A1528', accent: '#8C1C3C', soft: '#D9A7B0', grid: '#EADFDB', muted: '#7A6066' };

export function weekTick(iso: string) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`;
}

const tooltipStyle = {
  contentStyle: { borderRadius: 16, border: '1px solid #EADFDB', boxShadow: '0 10px 30px -12px rgba(74,21,40,.25)', fontSize: 12, fontFamily: 'inherit' },
  labelStyle: { fontWeight: 700, color: C.dark },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function AreaTrend({
  data, x, y, name, unit = '', height = 220, max,
}: { data: Row[]; x: string; y: string; name: string; unit?: string; height?: number; max?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${y}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={x} tickFormatter={(v) => weekTick(String(v))} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} domain={[0, max ?? 'auto']} allowDecimals={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => `Апта: ${weekTick(String(v))}`} formatter={(v) => [v == null ? '—' : `${v}${unit}`, name]} />
        <Area type="monotone" dataKey={y} name={name} stroke={C.accent} strokeWidth={2.5} fill={`url(#g-${y})`} connectNulls dot={{ r: 3, fill: C.accent }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({
  data, x, bars, height = 240, layout = 'horizontal', tickFormatter, unit = '',
}: {
  data: Row[]; x: string; bars: { key: string; name: string; color?: string }[];
  height?: number; layout?: 'horizontal' | 'vertical'; tickFormatter?: (v: string) => string; unit?: string;
}) {
  const vertical = layout === 'vertical';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 10, right: 8, left: vertical ? 0 : -18, bottom: 0 }} barGap={4}>
        <CartesianGrid stroke={C.grid} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey={x} width={110} tick={{ fontSize: 11, fill: C.dark }} axisLine={false} tickLine={false}
              tickFormatter={(v) => (String(v).length > 16 ? String(v).slice(0, 15) + '…' : String(v))} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={tickFormatter as never} />
            <YAxis tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
          </>
        )}
        <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(217,167,176,.18)' }} labelFormatter={(v) => (tickFormatter ? tickFormatter(String(v)) : String(v))}
          formatter={(v, n) => [`${v}${unit}`, n]} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color ?? [C.dark, C.soft, C.accent][i % 3]}
            radius={vertical ? [0, 8, 8, 0] : [8, 8, 0, 0]} maxBarSize={vertical ? 18 : 34} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
