import { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Legend,
} from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Card, PageHeader, Spinner, Stat, Badge, Tabs } from '../components/ui.jsx';
import { label, money } from '../lib/format.js';

// Categorical palette (validated: adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 19.6).
// Three slots are < 3:1 contrast, so every chart has a legend and a table view.
const TYPE_COLORS = {
  experiment_setup: '#2a78d6', maintenance: '#eb6834', access: '#1baf7a', ticket: '#eda100', consumables: '#e87ba4',
};
const TYPES = Object.keys(TYPE_COLORS);
const SINGLE = '#2d47bb';
const AXIS = { fontSize: 11, fill: '#5b6770' };
const GRID = '#e3e8ea';

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #d4dadd', fontSize: 12, boxShadow: '0 4px 16px rgb(0 0 0 / .08)' },
  labelStyle: { color: '#17212b', fontWeight: 600 },
  itemStyle: { color: '#17212b', padding: 0 },
  cursor: { fill: 'rgb(45 71 187 / .06)' },
};

function ChartCard({ title, source, table, children }) {
  const [view, setView] = useState('chart');
  return (
    <Card title={<span className="flex items-center gap-2">{title} <Badge tone={source === 'MongoDB' ? 'green' : 'blue'}>{source}</Badge></span>}
      action={table && <Tabs value={view} onChange={setView} tabs={[['chart', <BarChart3 key="c" className="h-3.5 w-3.5" />], ['table', <Table2 key="t" className="h-3.5 w-3.5" />]]} />}>
      {view === 'chart' ? children : <div className="max-h-72 overflow-auto">{table}</div>}
    </Card>
  );
}

function SimpleTable({ cols, rows }) {
  return (
    <table className="table-base">
      <thead><tr>{cols.map(([k, l, r]) => <th key={k} className={r ? 'text-right' : ''}>{l}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{cols.map(([k, , r]) => <td key={k} className={r ? 'text-right tnum' : ''}>{row[k]}</td>)}</tr>)}</tbody>
    </table>
  );
}

export default function Stats() {
  const [weeks, setWeeks] = useState('10');
  const { data, loading } = useFetch(`/stats?weeks=${weeks}`);
  if (loading || !data) return <Spinner />;

  // pivot perWeek rows -> [{week, type1: n, ...}]
  const weekMap = {};
  data.perWeek.forEach(({ week, type, n }) => { (weekMap[week] ||= { week }); weekMap[week][type] = n; });
  const perWeek = Object.values(weekMap).map((w) => ({ ...w, label: new Date(w.week).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }));
  const status = Object.fromEntries(data.statusBreakdown.map((s) => [s.status, s.n]));
  const totalRequests = data.statusBreakdown.reduce((s, x) => s + x.n, 0);
  const activity = data.activityPerDay.map((d) => ({ day: d._id.slice(5), n: d.n }));
  const maxAction = Math.max(...data.topActions.map((a) => a.n), 1);

  return (
    <>
      <PageHeader title="Usage & insights" subtitle="How lab resources are used over time — SQL aggregates from MySQL and aggregation pipelines over MongoDB."
        actions={<Tabs value={weeks} onChange={setWeeks} tabs={[['4', '4 weeks'], ['10', '10 weeks'], ['26', '6 months']]} />} />

      <div className="mb-9 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        <Stat label="Requests (all time)" value={totalRequests} />
        <Stat label="Open" value={(status.open || 0) + (status.in_progress || 0) + (status.waiting || 0)} tone="blue" />
        <Stat label="Resolved / closed" value={(status.resolved || 0) + (status.closed || 0)} />
        <Stat label="Equipment hours booked" value={data.equipmentHours.reduce((s, e) => s + Number(e.hours), 0).toFixed(0)} tone="gold" />
        <Stat label="Consumables spend" value={money(data.consumableUsage.reduce((s, c) => s + Number(c.cost), 0))} tone="gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ChartCard title="Requests filed per week, by type" source="MySQL"
            table={<SimpleTable cols={[['label', 'Week of'], ...TYPES.map((t) => [t, label(t), true])]} rows={perWeek.map((w) => ({ ...w, ...Object.fromEntries(TYPES.map((t) => [t, w[t] || 0])) }))} />}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={perWeek} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [v, label(n)]} />
                <Legend formatter={(v) => <span className="text-xs text-ink">{label(v)}</span>} iconType="circle" iconSize={8} />
                {TYPES.map((t) => <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t]} stroke="#fff" strokeWidth={2} />)}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Equipment hours booked" source="MySQL"
          table={<SimpleTable cols={[['name', 'Equipment'], ['hours', 'Hours', true], ['bookings', 'Bookings', true]]} rows={data.equipmentHours} />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.equipmentHours.map((e) => ({ ...e, hours: Number(e.hours) }))} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={150} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v} h`, 'Booked']} />
              <Bar dataKey="hours" fill={SINGLE} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consumables spend by item" source="MySQL"
          table={<SimpleTable cols={[['name', 'Item'], ['qty', 'Qty', true], ['cost', 'Cost', true]]} rows={data.consumableUsage} />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.consumableUsage.map((c) => ({ ...c, cost: Number(c.cost) }))} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={160} />
              <Tooltip {...tooltipStyle} formatter={(v, _n, p) => [`${money(v)} (${p.payload.qty} ${p.payload.unit})`, 'Spend']} />
              <Bar dataKey="cost" fill={SINGLE} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lab activity per day" source="MongoDB"
          table={<SimpleTable cols={[['day', 'Day'], ['n', 'Events', true]]} rows={activity.slice().reverse()} />}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={activity}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SINGLE} stopOpacity={0.25} /><stop offset="100%" stopColor={SINGLE} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
              <Tooltip {...tooltipStyle} cursor={{ stroke: "#5b6770", strokeDasharray: '3 3' }} formatter={(v) => [v, 'Events']} />
              <Area type="monotone" dataKey="n" stroke={SINGLE} strokeWidth={2} fill="url(#g)" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card title={<span className="flex items-center gap-2">Average time to resolve <Badge tone="blue">MySQL</Badge></span>}>
          <ul className="space-y-3">
            {data.resolution.map((r) => (
              <li key={r.type}>
                <div className="flex justify-between text-sm"><span>{label(r.type)}</span><span className="tnum">{r.avg_hours} h <span className="text-muted">· {r.resolved} resolved</span></span></div>
                <div className="mt-1 h-1.5 rounded-full bg-brand-50"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${(r.avg_hours / Math.max(...data.resolution.map((x) => x.avg_hours))) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-4">
            <div className="label">Most frequent actions <Badge tone="green" className="ml-1">MongoDB $group</Badge></div>
            <ul className="mt-2 space-y-1.5">
              {data.topActions.map((a) => (
                <li key={a._id} className="flex items-center gap-3 text-xs">
                  <span className="w-36 truncate tnum">{a._id}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-brand-50"><div className="h-1.5 rounded-full bg-tape-400" style={{ width: `${(a.n / maxAction) * 100}%` }} /></div>
                  <span className="w-10 text-right tnum">{a.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
