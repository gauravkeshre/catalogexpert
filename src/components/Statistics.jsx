import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { chartGroups, statisticsSourceKey } from "@/lib/statistics"
import { presetQueries } from "@/lib/preset-queries"

const colors = ["var(--chart-4)", "var(--chart-2)", "var(--chart-5)", "var(--chart-1)", "var(--chart-3)", "var(--muted-foreground)", "var(--foreground)"]
const number = (value) => value.toLocaleString()
const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : "0%"
const signed = (value) => `${value > 0 ? "+" : ""}${number(value)}`
const seriesNames = { all: "All apps", ...Object.fromEntries(presetQueries.map(({ id, title }) => [id, title])) }

export function StatisticsLoading() {
  return <div role="region" aria-label="Statistics loading" aria-busy="true" className="space-y-6">
    <p role="status" aria-label="Loading statistics" className="text-sm text-muted-foreground">Loading statistics...</p>
    <div aria-hidden="true" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <Card key={index}><CardContent className="space-y-3">
          <div className="statistics-shimmer h-3 w-3/4" /><div className="statistics-shimmer h-8 w-16" />
        </CardContent></Card>)}
      </div>
      <Card><CardContent className="space-y-5">
        <div className="statistics-shimmer h-4 w-40" /><div className="statistics-shimmer h-56 w-full" />
      </CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => <Card key={index}><CardContent className="space-y-5">
          <div className="statistics-shimmer h-4 w-32" /><div className="statistics-shimmer h-40 w-full" />
        </CardContent></Card>)}
      </div>
    </div>
  </div>
}

function ChartCard({ title, description, children }) {
  return <Card className="min-w-0">
    <CardContent className="space-y-4">
      <div><h3 className="font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}</div>
      {children}
    </CardContent>
  </Card>
}

function Bars({ groups, total, label }) {
  const max = Math.max(1, ...groups.map(({ count }) => count))
  return <div role="group" aria-label={label} className="space-y-3">
    {groups.map(({ label: name, count }, index) => <div key={name} className="space-y-1">
      <div className="flex min-w-0 justify-between gap-3 text-xs">
        <span className="min-w-0 truncate" title={name}>{name}</span>
        <span className="shrink-0 tabular-nums">{number(count)} ({percent(count, total)})</span>
      </div>
      <div className="h-2 bg-muted"><div className="h-full" style={{ width: `${count / max * 100}%`, background: colors[index % colors.length] }} /></div>
    </div>)}
  </div>
}

function Pie({ groups }) {
  const total = groups.reduce((sum, { count }) => sum + count, 0)
  const segments = groups.map(({ count }, index) => {
    const start = groups.slice(0, index).reduce((sum, group) => sum + group.count, 0) / total * 100
    return `${colors[index % colors.length]} ${start}% ${start + count / total * 100}%`
  })
  return <div className="flex flex-col items-center gap-6 sm:flex-row sm:flex-wrap">
    <div role="img" aria-label={`Property distribution: ${groups.map(({ label, count }) => `${label}: ${number(count)}`).join(", ")}`}
      className="relative mx-auto size-40 shrink-0 rounded-full"
      style={{ background: `conic-gradient(${segments.join(", ")})` }}>
      <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-card">
        <span className="text-xl font-semibold tabular-nums">{number(total)}</span>
        <span className="text-[10px] text-muted-foreground">memberships</span>
      </div>
    </div>
    <ul className="w-full min-w-0 flex-1 space-y-2 text-xs sm:w-auto sm:min-w-40">
      {groups.map(({ label, count }, index) => <li key={label} className="flex items-start gap-2">
        <span className="mt-0.5 size-2.5 shrink-0" style={{ background: colors[index % colors.length] }} />
        <span className="min-w-0 flex-1 break-words">{label}</span>
        <span className="shrink-0 tabular-nums">{percent(count, total)}</span>
      </li>)}
    </ul>
  </div>
}

function Growth({ data, audience, type, filtered }) {
  const history = data.statisticsHistory.filter((entry) => entry.scopes[audience]
    && Date.parse(entry.capturedAt) <= data.capturedAt?.getTime()
    && entry.sources === statisticsSourceKey(data.sources))
  const series = type === "all" ? ["all", "customEngine", "declarative", "bots", "tabs", "messageExtensions"] : [type]
  if (filtered || data.warning || data.statisticsWarning || history.length < 2) {
    return <ChartCard title="Catalog growth" description="Observed net change in unique-app counts, not app creation dates.">
      <p className="text-sm text-muted-foreground">{filtered
        ? "Historical growth is unavailable for custom property filters. Clear the applied query to see growth for this capability and ring."
        : data.warning ? "Growth is paused because catalog sources failed. Retry a complete refresh before comparing counts."
          : data.statisticsWarning ? "History storage is unavailable. Growth requires saved snapshots."
            : "Baseline established when a complete catalog loads. Refresh after the catalog changes to compare a second snapshot."}</p>
    </ChartCard>
  }
  const first = history[0]
  const last = history.at(-1)
  const maxCount = Math.max(2, ...history.flatMap((entry) => series.map((id) => entry.scopes[audience][id])))
  const max = Math.ceil(maxCount / 2) * 2
  const start = Date.parse(first.capturedAt)
  const duration = Date.parse(last.capturedAt) - start
  return <ChartCard title="Catalog growth"
    description={`Net count change since ${new Date(first.capturedAt).toLocaleString()}. Up to 90 snapshots in this browser; only matching source sets and rings are compared. Not historical creation or adoption data.`}>
    <svg viewBox="0 0 640 220" className="w-full" role="img" aria-label="Catalog growth over time">
      {[0, 0.5, 1].map((fraction) => <g key={fraction}>
        <line x1="48" x2="624" y1={180 - fraction * 160} y2={180 - fraction * 160} stroke="var(--border)" />
        <text x="40" y={184 - fraction * 160} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{number(Math.round(max * fraction))}</text>
      </g>)}
      {series.map((id, index) => <polyline key={id} fill="none" stroke={colors[index]} strokeWidth="2.5"
        points={history.map((entry) => `${48 + (Date.parse(entry.capturedAt) - start) / duration * 576},${180 - entry.scopes[audience][id] / max * 160}`).join(" ")}>
        <title>{seriesNames[id]}: {history.map((entry) => `${new Date(entry.capturedAt).toLocaleString()}: ${entry.scopes[audience][id]}`).join("; ")}</title>
      </polyline>)}
      <text x="48" y="207" fill="var(--muted-foreground)" fontSize="11">{new Date(first.capturedAt).toLocaleDateString()}</text>
      <text x="624" y="207" textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{new Date(last.capturedAt).toLocaleDateString()}</text>
    </svg>
    <Table aria-label="Growth by capability">
      <TableHeader><TableRow><TableHead>Capability</TableHead><TableHead>Baseline</TableHead><TableHead>Latest</TableHead><TableHead>Net change</TableHead></TableRow></TableHeader>
      <TableBody>{series.map((id, index) => {
        const before = first.scopes[audience][id]
        const after = last.scopes[audience][id]
        return <TableRow key={id}>
          <TableCell><span className="mr-2 inline-block size-2" style={{ background: colors[index] }} />{seriesNames[id]}</TableCell>
          <TableCell>{number(before)}</TableCell><TableCell>{number(after)}</TableCell>
          <TableCell>{signed(after - before)} ({before ? `${signed(Number(((after - before) / before * 100).toFixed(1)))}%` : after ? "new" : "0%"})</TableCell>
        </TableRow>
      })}</TableBody>
    </Table>
  </ChartCard>
}

function PropertyGroups({ groups, total }) {
  const [offset, setOffset] = useState(0)
  const pageSize = 100
  const currentOffset = Math.min(offset, Math.max(0, Math.ceil(groups.length / pageSize) - 1) * pageSize)
  return <ChartCard title="All property groups" description={`${number(groups.length)} groups. Full counts, including groups combined in the charts.`}>
    <div className="max-h-96 overflow-auto">
      <Table aria-label="Property group counts">
        <TableHeader><TableRow><TableHead>Property value</TableHead><TableHead>Apps</TableHead><TableHead>Share of matching apps</TableHead></TableRow></TableHeader>
        <TableBody>{groups.slice(currentOffset, currentOffset + pageSize).map(({ label, count }) => <TableRow key={label}>
          <TableCell className="max-w-xs whitespace-normal break-words">{label}</TableCell>
          <TableCell>{number(count)}</TableCell><TableCell>{percent(count, total)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
    {groups.length > pageSize && <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Groups {number(currentOffset + 1)}-{number(Math.min(currentOffset + pageSize, groups.length))} of {number(groups.length)}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" aria-label="Previous property groups" disabled={!currentOffset}
          onClick={() => setOffset(currentOffset - pageSize)}>Previous</Button>
        <Button variant="outline" size="sm" aria-label="Next property groups" disabled={currentOffset + pageSize >= groups.length}
          onClick={() => setOffset(currentOffset + pageSize)}>Next</Button>
      </div>
    </div>}
  </ChartCard>
}

export default function Statistics({ summary, data, audience, type, filtered, grouping, onGroupingChange, showRings }) {
  const { appCount, counts, properties, groups, variants, developers, entitledApps } = summary
  const options = [
    { value: "$entitlements", label: "Entitlement state" },
    ...(showRings ? [{ value: "$rings", label: "Ring" }] : []),
    ...properties,
  ]
  const effectiveGrouping = !showRings && grouping === "$rings" ? JSON.stringify(["developerName"]) : grouping
  const topGroups = chartGroups(groups)
  const capabilityGroups = presetQueries.map(({ id, title }) => ({ label: title, count: counts[id] }))
  return <div role="region" aria-label="Statistics results" className="min-w-0 space-y-6">
    {data.statisticsWarning && <p role="alert" className="border border-destructive/40 p-3 text-sm">{data.statisticsWarning}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="text-lg font-semibold">{type === "all" ? "All apps" : seriesNames[type]}</h3>
      {filtered && <Badge variant="outline">Applied property filters</Badge>}
      <p role="status" className="text-sm text-muted-foreground">{number(appCount)} matching apps</p>
    </div>
    <dl aria-label="Statistics totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {[[appCount, "Unique apps"], [counts.customEngine, "Custom Engine Agents (CEA)"], [counts.declarative, "Declarative Agents (DA)"],
        [variants, "Matching variants"], [developers, "Developers"], [entitledApps, "Apps with entitlements"]]
        .map(([value, label]) => <Card key={label}><CardContent>
          <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{number(value)}</dd>
        </CardContent></Card>)}
    </dl>
    <p className="text-xs leading-relaxed text-muted-foreground">Each app is counted once per group across matching variants. Capabilities and multi-value properties can overlap; their counts may exceed the unique-app total.</p>
    <Growth data={data} audience={audience} type={type} filtered={filtered} />
    {appCount ? <>
      <ChartCard title="Capability counts" description="CEA, DA, and other capabilities detected in the matching variants. An app can have more than one capability.">
        <Bars groups={capabilityGroups} total={appCount} label="Matching apps by capability" />
      </ChartCard>
      <div className="flex flex-wrap items-center gap-3">
        <label id="statistics-grouping-label" className="text-sm font-medium">Group by property</label>
        <Select value={effectiveGrouping} onValueChange={onGroupingChange} items={options}>
          <SelectTrigger aria-labelledby="statistics-grouping-label" className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>{options.map(({ value, label }) =>
            <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Property counts" description="Unique apps per group, as a percentage of matching apps. The combined remainder sums group memberships and may exceed 100%.">
          <Bars groups={topGroups} total={appCount} label="Matching apps grouped by property" />
        </ChartCard>
        <ChartCard title="Property distribution" description="Pie slices represent group memberships, not mutually exclusive apps. Missing values appear as Not specified.">
          <Pie groups={topGroups} />
        </ChartCard>
      </div>
      <PropertyGroups key={effectiveGrouping} groups={groups} total={appCount} />
    </> : <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">No matching apps. Try a broader capability, query, or ring.</p>}
  </div>
}
