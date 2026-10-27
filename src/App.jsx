import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  IconAdjustments, IconApps, IconArrowRight, IconChevronLeft, IconChevronRight,
  IconCode, IconLayoutDashboard, IconLayoutGrid, IconList, IconMenu2, IconMoon, IconRefresh,
  IconSearch, IconSettings, IconShieldCheck, IconSun, IconDeviceDesktop, IconChartBar,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { appEntries, audienceLabel, catalog, findApps, groupStates } from "@/lib/catalog"
import { defaultPreferences, usePreferences } from "@/lib/preferences"
import AppDetails from "@/components/AppDetails"
import AppGrid from "@/components/AppGrid"
import AppIcon from "@/components/AppIcon"
import PropertyVisibilitySettings from "@/components/PropertyVisibilitySettings"
import PresetQueries from "@/components/PresetQueries"
import QueryEditor from "@/components/QueryEditor"
import ExportResults from "@/components/ExportResults"
import Statistics, { StatisticsLoading } from "@/components/Statistics"
import { countPresetQueries, presetQueries } from "@/lib/preset-queries"
import { canUseSimple, createGroup, describeQuery, filterQueryDefinitions } from "@/lib/app-query"
import { useSavedQueries } from "@/lib/saved-queries"
import { useStatistics } from "@/lib/use-statistics"

const pages = [
  { id: "advanced", label: "Advanced", icon: IconCode },
  { id: "statistics", label: "Statistics", icon: IconChartBar },
  { id: "library", label: "Library", icon: IconLayoutDashboard },
  { id: "entitlements", label: "Entitlement states", icon: IconShieldCheck },
]
const pageSize = 25
const stateReference = [
  ["InstalledAndPermanent", "The app is installed. The user cannot remove it. The store does not show it. Do not use this state for bots or resource-specific permissions."],
  ["Installed", "The app is installed. The user can remove it."],
  ["PreConsented", "The app has consent. The first use installs it without a prompt."],
  ["Featured", "The app is featured. The user must install it before use."],
  ["NotInstalled", "The app is not installed. Existing tabs remain visible. Do not use this state for new apps."],
  ["InstalledAndDeprecated", "The app is deprecated. Teams Admin Center shows it. The Teams client does not show it."],
  ["HiddenFromAppStore", "App discovery does not show the app in the Teams client or Teams Admin Center."],
]

function Appearance({ theme, onChange }) {
  return (
    <div className="space-y-2">
      <Label>Appearance</Label>
      <div className="grid grid-cols-3 gap-1 border bg-background p-1" role="group" aria-label="Appearance">
        {[
          ["light", "Light", IconSun],
          ["dark", "Dark", IconMoon],
          ["system", "System", IconDeviceDesktop],
        ].map(([value, label, Icon]) => (
          <Button key={value} variant={theme === value ? "secondary" : "ghost"} size="icon-sm"
            className="w-full" aria-label={label} title={label}
            aria-pressed={theme === value} onClick={() => onChange(value)}>
            <Icon />
          </Button>
        ))}
      </div>
    </div>
  )
}

function Sidebar({ page, navigate, preferences, updatePreferences }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-sidebar p-4 text-sidebar-foreground">
      <div className="flex shrink-0 items-center gap-3 px-2 py-4">
        <div className="flex size-9 items-center justify-center bg-primary text-primary-foreground"><IconApps className="size-5" /></div>
        <div><p className="text-sm font-semibold">Catalog Explorer</p><p className="text-xs text-muted-foreground">App definitions</p></div>
      </div>
      <nav aria-label="Main navigation" className="mt-6 shrink-0 space-y-1">
        {pages.map(({ id, label, icon: Icon }) => (
          <Button key={id} variant={page === id ? "secondary" : "ghost"} onClick={() => navigate(id)}
            aria-current={page === id ? "page" : undefined}
            className="w-full justify-start">
            <Icon className="size-4" />{label}
          </Button>
        ))}
      </nav>
      <div className="mt-auto shrink-0 space-y-4 pt-8">
        <Button variant={page === "settings" ? "secondary" : "ghost"} onClick={() => navigate("settings")}
          aria-current={page === "settings" ? "page" : undefined}
          className="w-full justify-start">
          <IconSettings className="size-4" />Settings
        </Button>
        <Separator />
        <Appearance theme={preferences.theme} onChange={(theme) => updatePreferences({ theme })} />
      </div>
    </div>
  )
}

function DisplaySettings({ preferences, updatePreferences, schema }) {
  const fields = [
    ["showRings", "Ring information", "Show audience filters and ring labels. Hidden rings do not filter results. Ring visibility alone does not remove fields from JSON."],
    ["showStats", "Catalog statistics", "Show app, source, and entitlement totals above results."],
    ["showDescriptions", "App descriptions", "Show descriptions in the library."],
    ["showIds", "App identifiers", "Show app IDs and Office asset IDs in the library."],
    ["showEntitlements", "Entitlement summaries", "Show entitlement badges in the library and app summary."],
  ]
  return (
    <section className="max-w-3xl space-y-6" aria-labelledby="settings-title">
      <div><h2 id="settings-title" className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose how much information the explorer shows.</p></div>
      <Card>
        <CardContent className="divide-y">
          {fields.map(([key, title, description]) => (
            <div key={key} className="flex items-start justify-between gap-6 py-5 first:pt-0 last:pb-0">
              <div className="space-y-1.5">
                <Label htmlFor={key}>{title}</Label>
                <p id={`${key}-description`} className="max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
              <Switch id={key} checked={preferences[key]} aria-describedby={`${key}-description`}
                onCheckedChange={(checked) => updatePreferences({ [key]: checked })} className="mt-1 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
      <PropertyVisibilitySettings schema={schema} mutedProperties={preferences.mutedProperties}
        onChange={(mutedProperties) => updatePreferences({ mutedProperties })} />
      <p className="text-xs text-muted-foreground">Settings stay in this browser. They do not change catalog data.</p>
      <Button variant="outline" onClick={() => updatePreferences(defaultPreferences)}>Reset display settings</Button>
    </section>
  )
}

function RingFilter({ audiences, value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}
      items={[{ value: "all", label: "All rings" }, ...audiences.map((ring) => ({ value: ring, label: audienceLabel(ring) }))]}>
      <SelectTrigger aria-label="Filter by ring" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectItem value="all">All rings</SelectItem>
        {audiences.map((ring) => <SelectItem key={ring} value={ring}>{audienceLabel(ring)}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function EmptyState({ title, children }) {
  return (
    <div className="border border-dashed px-6 py-16 text-center">
      <IconSearch className="mx-auto mb-4 size-6 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function LibraryTable({ results, entitlements, preferences, openApp, audience }) {
  function openRow(event, appId) {
    if (event.target.closest("button, a, input, select, textarea, [role='button']")) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed &&
      (event.currentTarget.contains(selection.anchorNode) || event.currentTarget.contains(selection.focusNode))) return

    // Give the dialog a keyboard-accessible return target for clicks outside its buttons.
    event.currentTarget.querySelector("button")?.focus({ preventScroll: true })
    openApp(appId)
  }

  function openFromButton(event, appId) {
    event.stopPropagation()
    openApp(appId)
  }

  return (
    <div className="overflow-hidden border bg-card">
      <Table aria-label="App library">
        <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="pl-5">App</TableHead><TableHead className="hidden sm:table-cell">Version</TableHead>
          {preferences.showRings && <TableHead className="hidden sm:table-cell">Rings</TableHead>}
          {preferences.showEntitlements && <TableHead className="hidden sm:table-cell">Entitlements</TableHead>}
          <TableHead><span className="sr-only">Details</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {results.map(({ appId, app, audienceMap }) => {
            const displayedApp = audience === "all" ? app : audienceMap.get(audience)
            const states = [...new Set(appEntries(entitlements, appId, audience).map((entry) => entry.state || "Unknown"))]
            return (
              <TableRow key={appId} className="cursor-pointer" onClick={(event) => openRow(event, appId)}>
                <TableCell className="max-w-[32rem] py-4 pl-5 whitespace-normal">
                  <div className="flex items-start gap-3">
                    <AppIcon app={displayedApp} />
                    <div className="min-w-0">
                      <button onClick={(event) => openFromButton(event, appId)} aria-haspopup="dialog" className="text-left font-medium break-words hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        {displayedApp.name || appId}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">{displayedApp.developerName || "Unknown developer"}</p>
                      <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                        {displayedApp.version || "Unknown version"}
                        {preferences.showEntitlements && states.length > 0 && ` · ${states.join(", ")}`}
                      </p>
                      {preferences.showRings && <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                        {[...audienceMap.keys()].map(audienceLabel).join(", ")}
                      </p>}
                      {preferences.showDescriptions && displayedApp.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{displayedApp.description}</p>}
                      {preferences.showIds && <div className="mt-2 space-y-1 font-mono text-[11px] break-all text-muted-foreground">
                        <p>App ID: {appId}</p>
                        {displayedApp.officeAssetId && <p>Office asset ID: {displayedApp.officeAssetId}</p>}
                      </div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{displayedApp.version || "Unknown"}</TableCell>
                {preferences.showRings && <TableCell className="hidden sm:table-cell"><div className="flex max-w-44 flex-wrap gap-1">
                  {[...audienceMap.keys()].map((ring) => <Badge variant="outline" key={ring}>{audienceLabel(ring)}</Badge>)}
                </div></TableCell>}
                {preferences.showEntitlements && <TableCell className="hidden sm:table-cell">
                  <div className="flex max-w-52 flex-wrap gap-1">
                    {states.slice(0, 2).map((state) => <Badge key={state} variant="secondary">{state}</Badge>)}
                    {states.length > 2 && <span className="text-xs text-muted-foreground">+{states.length - 2}</span>}
                    {states.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                  </div>
                </TableCell>}
                <TableCell className="pr-4 text-right">
                  <Button variant="ghost" size="icon-sm" onClick={(event) => openFromButton(event, appId)} aria-haspopup="dialog" aria-label={`Open ${displayedApp.name || appId}`}>
                    <IconArrowRight />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function AppResults({ results, offset, onPageChange, entitlements, preferences, updatePreferences, openApp, audience,
  showEmpty, emptyTitle, emptyDescription, exportQuery }) {
  const currentOffset = Math.min(offset, Math.max(0, Math.ceil(results.length / pageSize) - 1) * pageSize)
  const visibleResults = results.slice(currentOffset, currentOffset + pageSize)
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" role="status">{results.length.toLocaleString()} matching apps</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportResults results={results} query={exportQuery} audience={audience} />
          <div role="group" aria-label="App view" className="flex gap-1">
          {[["grid", "Grid view", IconLayoutGrid], ["list", "List view", IconList]].map(([value, label, Icon]) => (
            <Button key={value} variant={preferences.viewMode === value ? "secondary" : "ghost"} size="icon-sm"
              aria-label={label} title={label} aria-pressed={preferences.viewMode === value}
              onClick={() => updatePreferences({ viewMode: value })}>
              <Icon />
            </Button>
          ))}
          </div>
        </div>
      </div>
      {results.length > 0
        ? preferences.viewMode === "grid"
          ? <AppGrid results={visibleResults} openApp={openApp} audience={audience} />
          : <LibraryTable results={visibleResults} entitlements={entitlements}
              preferences={preferences} openApp={openApp} audience={audience} />
        : showEmpty && <EmptyState title={emptyTitle}>{emptyDescription}</EmptyState>}
      {results.length > 0 && <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{currentOffset + 1}-{Math.min(currentOffset + pageSize, results.length)} of {results.length.toLocaleString()} apps</p>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={currentOffset === 0}
            onClick={() => onPageChange(currentOffset - pageSize)}><IconChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={currentOffset + pageSize >= results.length}
            onClick={() => onPageChange(currentOffset + pageSize)}><IconChevronRight /></Button>
        </div>
      </div>}
    </>
  )
}

function CatalogSnapshot({ data }) {
  return data.capturedAt && <p role="status" aria-label="Catalog data source" className="mt-2 text-xs text-muted-foreground">
    {data.fromCache ? "Local cache" : "Live catalog"} · Captured {data.capturedAt.toLocaleString()}
  </p>
}

function CatalogFeedback({ data, showRings }) {
  return (
    <>
      {data.loading && <div role="status" className="space-y-3 border p-4">
        <p className="text-sm text-muted-foreground">{showRings ? data.message.replace(/^[^\p{L}\p{N}]+/u, "") : "Loading catalog data..."}</p>
        <Progress value={data.progress} aria-label="Catalog loading progress" />
      </div>}
      {(data.error || data.warning) && <div role="alert" className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
        {data.error || data.warning}{data.capturedAt && " Previously loaded data stays available."}
      </div>}
    </>
  )
}

function RefreshCatalog({ data }) {
  return (
    <Button variant="outline" onClick={() => catalog.load({ refresh: true })} disabled={data.loading}>
      <IconRefresh className={data.loading ? "animate-spin" : ""} />{data.error || data.warning ? "Retry" : "Refresh"}
    </Button>
  )
}

function CatalogSummary({ data, count, page, pending = false }) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid={`${page}-summary`}>
      <h2 id={`${page}-title`} className="sr-only">{page === "library" ? "Library" : page === "statistics" ? "Statistics" : "Advanced"}</h2>
      <p role="status" aria-label="Catalog data source"
        title={data.fromCache ? "Local cache" : "Live catalog"}
        className="min-w-0 truncate text-sm text-muted-foreground">
        {count === null ? pending ? "Loading statistics, " : "Statistics unavailable, "
          : `Showing ${count.toLocaleString()} of ${data.definitions.size.toLocaleString()} apps, `}
        {data.capturedAt
          ? <>synced on <time dateTime={data.capturedAt.toISOString()}>{data.capturedAt.toLocaleString()}</time></>
          : "not yet synced"}
      </p>
      <div className="shrink-0"><RefreshCatalog data={data} /></div>
    </div>
  )
}

function EntitlementStates({ groups, openState }) {
  if (!groups.length) return <EmptyState title="No entitlement states">No entitlements match the current data and filters.</EmptyState>
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map(([state, appIds]) => (
        <button key={state} onClick={() => openState(state)}
          className="group border bg-card p-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
          <IconShieldCheck className="mb-5 size-5 text-primary" />
          <h3 className="text-sm font-medium break-all">{state}</h3>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{appIds.size} apps</span>
            <IconArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
          </div>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const data = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot)
  const { preferences, error: preferenceError, updatePreferences } = usePreferences()
  const saved = useSavedQueries()
  const [page, setPage] = useState("library")
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [audience, setAudience] = useState("all")
  const [offset, setOffset] = useState(0)
  const [selectedApp, setSelectedApp] = useState(null)
  const [selectedAppDefinitions, setSelectedAppDefinitions] = useState(null)
  const [appDetailsOpen, setAppDetailsOpen] = useState(false)
  const [selectedState, setSelectedState] = useState(null)
  const [stateOffset, setStateOffset] = useState(0)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [presetOffset, setPresetOffset] = useState(0)
  const [appQuery, setAppQuery] = useState(createGroup)
  const [appliedQuery, setAppliedQuery] = useState(null)
  const [editorMode, setEditorMode] = useState("simple")
  const [statisticsType, setStatisticsType] = useState("all")
  const [statisticsQuery, setStatisticsQuery] = useState(createGroup)
  const [statisticsAppliedQuery, setStatisticsAppliedQuery] = useState(null)
  const [statisticsMode, setStatisticsMode] = useState("simple")
  const [statisticsGrouping, setStatisticsGrouping] = useState(JSON.stringify(["developerName"]))
  const querySchema = data.querySchema
  const mainRef = useRef(null)
  const scrollPositions = useRef({})
  const effectiveAudience = preferences.showRings ? audience : "all"

  useEffect(() => { catalog.load() }, [])
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    function applyTheme() {
      const dark = preferences.theme === "dark" || (preferences.theme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.documentElement.style.colorScheme = dark ? "dark" : "light"
    }
    applyTheme()
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [preferences.theme])

  const audiences = useMemo(() => [...new Set([...data.definitions.values()].flatMap((map) => [...map.keys()]))].sort(), [data.definitions])
  const search = useMemo(() => {
    try {
      return { results: findApps(data.definitions, data.entitlements, query, effectiveAudience), error: "" }
    } catch (error) {
      console.error("Cannot apply the search query.", error)
      return { results: [], error: "Cannot apply this query. Check wildcard and operator syntax." }
    }
  }, [data.definitions, data.entitlements, query, effectiveAudience])
  const groups = useMemo(() => groupStates(data.entitlements, effectiveAudience), [data.entitlements, effectiveAudience])
  const presetSummaries = useMemo(() => countPresetQueries(data.definitions, effectiveAudience), [data.definitions, effectiveAudience])
  const queryDefinitions = useMemo(() => appliedQuery
    ? filterQueryDefinitions(data.definitions, data.entitlements, appliedQuery, effectiveAudience, querySchema)
    : new Map(), [data.definitions, data.entitlements, appliedQuery, effectiveAudience, querySchema])
  const queryResults = useMemo(() => findApps(queryDefinitions, data.entitlements, "", effectiveAudience),
    [queryDefinitions, data.entitlements, effectiveAudience])
  const queryDirty = appliedQuery !== null && JSON.stringify(appQuery) !== JSON.stringify(appliedQuery)
  const statistics = useStatistics({
    enabled: page === "statistics" && !data.loading && Boolean(data.capturedAt),
    definitions: data.definitions, entitlements: data.entitlements, schema: querySchema,
    query: statisticsAppliedQuery, audience: effectiveAudience, type: statisticsType,
    grouping: !preferences.showRings && statisticsGrouping === "$rings" ? JSON.stringify(["developerName"]) : statisticsGrouping,
  })
  const statisticsLoading = data.loading || (!data.capturedAt && !data.error) || statistics.pending
  const statisticsDirty = statisticsAppliedQuery !== null && JSON.stringify(statisticsQuery) !== JSON.stringify(statisticsAppliedQuery)
  const stateApps = [...(groups.find(([state]) => state === selectedState)?.[1] || [])]

  function navigate(nextPage) {
    scrollPositions.current[page] = mainRef.current?.scrollTop || 0
    setPage(nextPage)
    setMenuOpen(false)
    requestAnimationFrame(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = scrollPositions.current[nextPage] || 0
        mainRef.current.focus()
      }
    })
  }

  function changePreferences(changes) {
    if (changes.showRings === false) {
      setAudience("all")
      setOffset(0)
      setPresetOffset(0)
    }
    updatePreferences(changes)
  }

  function openApp(appId, variants) {
    setSelectedApp(appId)
    setSelectedAppDefinitions(variants ? new Map([[appId, variants]]) : null)
    setAppDetailsOpen(true)
  }

  const sidebarProps = { page, navigate, preferences, updatePreferences: changePreferences }
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a href="#workspace" className="sr-only z-50 bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
      <aside className="hidden w-60 shrink-0 border-r md:block" aria-label="Sidebar"><Sidebar {...sidebarProps} /></aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />}><IconMenu2 /></SheetTrigger>
              <SheetContent side="left" className="w-72 p-0" showCloseButton>
                <SheetTitle className="sr-only">Navigation</SheetTitle><SheetDescription className="sr-only">Pages and appearance settings</SheetDescription>
                <Sidebar {...sidebarProps} />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">App Definitions Explorer</h1>
              <p className="mt-1 text-xs text-muted-foreground">More than just manifest</p>
            </div>
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {data.loading ? "Loading catalog" : data.error ? "Catalog unavailable" : data.capturedAt ? `Updated ${data.capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No catalog loaded"}
          </span>
        </header>
        <main ref={mainRef} id="workspace" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 outline-none sm:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {preferenceError && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-3 text-sm">{preferenceError}</p>}
            {page !== "advanced" && page !== "statistics" && saved.error && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-3 text-sm">{saved.error}</p>}
            {data.cacheWarning && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-3 text-sm">{data.cacheWarning}</p>}
            {page === "settings" ? <DisplaySettings preferences={preferences} updatePreferences={changePreferences} schema={querySchema} />
              : page === "statistics" ? <section aria-labelledby="statistics-title" className="min-w-0 space-y-6">
                <CatalogSummary data={data} count={statistics.result?.appCount ?? null} pending={statisticsLoading} page="statistics" />
                <CatalogFeedback data={data} showRings={preferences.showRings} />
                {preferences.showRings && <RingFilter audiences={audiences} value={audience} onChange={setAudience} />}
                <Tabs value={statisticsType} onValueChange={setStatisticsType}>
                  <div className="min-w-0 overflow-x-auto">
                    <TabsList variant="line" aria-label="Statistics capability">
                      <TabsTrigger value="all">All</TabsTrigger>
                      {presetQueries.map(({ id, title }) => <TabsTrigger key={id} value={id}>{title}</TabsTrigger>)}
                    </TabsList>
                  </div>
                </Tabs>
                <QueryEditor query={statisticsQuery} onChange={setStatisticsQuery}
                  mode={statisticsMode} onModeChange={setStatisticsMode} schema={querySchema} saved={saved}
                  onLoadQuery={(next) => {
                    setStatisticsQuery(next)
                    setStatisticsMode(canUseSimple(next) ? "simple" : "advanced")
                  }}
                  loading={data.loading || !data.capturedAt} hasRun={statisticsAppliedQuery !== null} dirty={statisticsDirty}
                  onRun={() => setStatisticsAppliedQuery(statisticsQuery)}
                  onReset={() => { setStatisticsQuery(createGroup()); setStatisticsMode("simple") }} />
                {statisticsAppliedQuery && <p className="text-xs leading-relaxed break-words text-muted-foreground" aria-label="Applied query">
                  {describeQuery(statisticsAppliedQuery, querySchema)}
                  {statisticsDirty && <Badge variant="outline" className="ml-2">Previous query</Badge>}
                </p>}
                {statisticsLoading ? <StatisticsLoading />
                  : statistics.error ? <div role="alert" className="space-y-3 border border-destructive/40 p-4 text-sm">
                    <p>{statistics.error}</p>
                    <Button variant="outline" onClick={statistics.retry}>Retry statistics</Button>
                  </div>
                    : statistics.result && <Statistics summary={statistics.result}
                      data={data} audience={effectiveAudience} type={statisticsType}
                      filtered={Boolean(statisticsAppliedQuery?.children.length)}
                      grouping={statisticsGrouping} onGroupingChange={setStatisticsGrouping} showRings={preferences.showRings} />}
              </section>
              : page === "advanced" ? <section aria-labelledby="advanced-title" className="min-h-64 space-y-6">
                <CatalogSummary data={data} count={queryResults.length} page="advanced" />
                <CatalogFeedback data={data} showRings={preferences.showRings} />
                {preferences.showRings && <RingFilter audiences={audiences} value={audience}
                  onChange={(value) => { setAudience(value); setPresetOffset(0); setOffset(0) }} />}
                <QueryEditor query={appQuery} onChange={setAppQuery} mode={editorMode} onModeChange={setEditorMode} schema={querySchema} saved={saved}
                  onLoadQuery={(next) => {
                    setAppQuery(next)
                    setEditorMode(canUseSimple(next) ? "simple" : "advanced")
                  }}
                  loading={data.loading || !data.capturedAt} hasRun={appliedQuery !== null} dirty={queryDirty}
                  onRun={() => { setAppliedQuery(appQuery); setPresetOffset(0) }}
                  onReset={() => { setAppQuery(createGroup()); setEditorMode("simple") }} />
                <div className="space-y-4" role="region" aria-label="Query results">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">Results</h3>
                    {queryDirty && <Badge variant="outline">Previous query</Badge>}
                  </div>
                  {appliedQuery && <p className="text-xs leading-relaxed break-words text-muted-foreground" aria-label="Applied query">
                    {describeQuery(appliedQuery, querySchema)}
                  </p>}
                  {appliedQuery ? <AppResults results={queryResults} exportQuery={appliedQuery} offset={presetOffset} onPageChange={setPresetOffset}
                    entitlements={data.entitlements} preferences={preferences} updatePreferences={changePreferences}
                    openApp={openApp} audience={effectiveAudience} showEmpty={!data.loading}
                    emptyTitle="No matching apps" emptyDescription="Try removing a condition, using a broader value, or changing an AND group to OR." />
                    : <EmptyState title="Build a query, find your apps">
                      Add conditions above and choose Run query. An empty query returns all apps.
                    </EmptyState>}
                </div>
              </section>
              : <>
                {page === "library" ? <CatalogSummary data={data} count={search.results.length} page="library" />
                  : <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Entitlement states</h2>
                    <p className="mt-2 hidden text-sm text-muted-foreground sm:block">Explore apps by their configured state.</p>
                    <CatalogSnapshot data={data} />
                  </div>
                  <div className="flex gap-2">
                    {page === "entitlements" && <Button variant="ghost" onClick={() => setReferenceOpen(true)}>State reference</Button>}
                    <RefreshCatalog data={data} />
                  </div>
                </div>}
                <CatalogFeedback data={data} showRings={preferences.showRings} />
                {preferences.showStats && <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y py-3 text-xs" aria-label="Catalog statistics">
                  {[[data.definitions.size, "Total apps"], [data.sources.size, "Loaded sources"], [data.entitlements.size, "Apps with entitlements"]].map(([value, label]) => (
                    <div key={label} className="flex items-baseline gap-2">
                      <dt>{label === "Loaded sources"
                        ? <button className="underline underline-offset-4" onClick={() => setSourcesOpen(true)}>Loaded sources</button>
                        : <span className="text-muted-foreground">{label}</span>}</dt>
                      <dd className="font-semibold tabular-nums">{value.toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>}
                {page === "library" && <PresetQueries queries={presetSummaries} loaded={Boolean(data.capturedAt)}
                  openApp={openApp}
                  savedQueries={saved.queries} schema={querySchema} definitions={data.definitions}
                  entitlements={data.entitlements} audience={effectiveAudience}
                  selection={preferences.queryTiles} onSelectionChange={(queryTiles) => changePreferences({ queryTiles })}
                  ringLabel={preferences.showRings ? effectiveAudience === "all" ? "all rings" : audienceLabel(effectiveAudience) : null}
                  onCreateQuery={() => {
                    setAppQuery(createGroup())
                    setAppliedQuery(null)
                    setEditorMode("simple")
                    setPresetOffset(0)
                    scrollPositions.current.advanced = 0
                    navigate("advanced")
                  }}
                  onSelect={(next) => {
                    setAppQuery(next)
                    setAppliedQuery(next)
                    setEditorMode(canUseSimple(next) ? "simple" : "advanced")
                    setPresetOffset(0)
                    scrollPositions.current.advanced = 0
                    navigate("advanced")
                  }} />}
                <div className="flex flex-col gap-3 sm:flex-row">
                  {page === "library" && <div className="relative flex-1">
                    <IconSearch className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
                    <Input id="searchInput" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }}
                      aria-label="Search apps" placeholder="Search apps, developers, or IDs..." className="pl-10" />
                  </div>}
                  {preferences.showRings && <RingFilter audiences={audiences} value={audience} onChange={(value) => { setAudience(value); setOffset(0) }} />}
                  <Button variant="outline" onClick={() => navigate("settings")}><IconAdjustments />Display</Button>
                </div>
                {page === "library" ? <>
                  {search.error && <p role="alert" className="text-sm text-destructive">{search.error}</p>}
                  <AppResults results={search.results} exportQuery={query} offset={offset} onPageChange={setOffset}
                    entitlements={data.entitlements} preferences={preferences} updatePreferences={changePreferences}
                    openApp={openApp} audience={effectiveAudience} showEmpty={!data.loading && !search.error}
                    emptyTitle={data.error ? "Catalog unavailable" : query ? "No matching apps" : "No apps loaded"}
                    emptyDescription={data.error ? "Use Retry to load the catalog." : query ? "Change the search or clear the filters." : "Refresh to load the catalog."} />
                </> : !data.loading || data.entitlements.size > 0 ? <EntitlementStates groups={groups} openState={(state) => { setSelectedState(state); setStateOffset(0) }} /> : null}
              </>}
          </div>
        </main>
      </div>
      <AppDetails appId={selectedApp} open={appDetailsOpen}
        definitions={selectedAppDefinitions || (page === "advanced" && appliedQuery ? queryDefinitions : data.definitions)}
        entitlements={data.entitlements} preferences={preferences}
        onClose={() => setAppDetailsOpen(false)} />
      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Loaded sources</DialogTitle><DialogDescription>{data.sources.size} successful catalog sources.</DialogDescription></DialogHeader>
          <ul className="divide-y">
            {[...data.sources].map(([url, rings]) => <li key={url} className="space-y-2 py-3">
              <a href={url} target="_blank" rel="noopener noreferrer" className="block text-xs break-all text-primary underline underline-offset-4">{url}</a>
              {preferences.showRings && <p className="text-xs text-muted-foreground">{[...rings].map(audienceLabel).join(", ")}</p>}
            </li>)}
          </ul>
        </DialogContent>
      </Dialog>
      <Dialog open={referenceOpen} onOpenChange={setReferenceOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>State reference</DialogTitle><DialogDescription>Configured entitlement states</DialogDescription></DialogHeader>
          <dl className="divide-y">{stateReference.map(([state, description]) => <div key={state} className="space-y-2 py-3">
            <dt className="text-sm font-medium break-all">{state}</dt><dd className="text-sm leading-relaxed text-muted-foreground">{description}</dd>
          </div>)}</dl>
        </DialogContent>
      </Dialog>
      <Dialog open={selectedState !== null} onOpenChange={(open) => { if (!open) setSelectedState(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle className="pr-6 break-all">{selectedState}</DialogTitle><DialogDescription>{stateApps.length} apps in this state.</DialogDescription></DialogHeader>
          <div className="divide-y">
            {stateApps.slice(stateOffset, stateOffset + pageSize).map((appId) => (
              <Button key={appId} variant="ghost" className="h-auto w-full justify-between py-3 text-left whitespace-normal"
                onClick={() => { setSelectedState(null); openApp(appId) }}>
                <span>{data.definitions.get(appId)?.values().next().value?.name || appId}</span><IconArrowRight />
              </Button>
            ))}
          </div>
          {stateApps.length > pageSize && <div className="flex justify-between">
            <Button variant="outline" disabled={stateOffset === 0} onClick={() => setStateOffset(stateOffset - pageSize)}>Previous</Button>
            <Button variant="outline" disabled={stateOffset + pageSize >= stateApps.length} onClick={() => setStateOffset(stateOffset + pageSize)}>Next</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
