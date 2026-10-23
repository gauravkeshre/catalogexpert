import { useMemo, useState, useSyncExternalStore } from "react"
import {
  IconBolt, IconBrain, IconBrackets, IconDeviceFloppy, IconLayout, IconMessage, IconPencil, IconRobot, IconRobotFace,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { describeQuery, filterQueryDefinitions, queryForPreset, validateQuery } from "@/lib/app-query"
import { findApps } from "@/lib/catalog"
import { reconcileQueryTiles } from "@/lib/query-tiles"
import AppIcon from "@/components/AppIcon"

const icons = {
  customEngine: IconBrain,
  declarative: IconBolt,
  bots: IconRobot,
  tabs: IconLayout,
  botOnly: IconRobotFace,
  messageExtensions: IconMessage,
  spfx: IconBrackets,
}

const mobileQuery = "(max-width: 767px)"
function subscribeMobile(callback) {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}
const isMobile = () => window.matchMedia(mobileQuery).matches

export default function PresetQueries({ queries, loaded, ringLabel, onSelect, savedQueries, schema,
  definitions, entitlements, audience, selection, onSelectionChange, onCreateQuery, openApp }) {
  const mobile = useSyncExternalStore(subscribeMobile, isMobile)
  const [editOpen, setEditOpen] = useState(false)
  const [editingLayout, setEditingLayout] = useState("desktop")
  const options = useMemo(() => [
    ...queries.map((preset) => ({
      ...preset, key: `preset:${preset.id}`, presetId: preset.id, query: queryForPreset(preset.id, schema),
    })),
    ...savedQueries.map((saved) => {
      const invalid = validateQuery(saved.query, true, schema)
      const matches = invalid ? new Map() : filterQueryDefinitions(definitions, entitlements, saved.query, audience, schema)
      return {
        key: `saved:${saved.id}`, title: saved.name, query: saved.query, invalid, matches,
        description: invalid ? `Invalid saved query: ${invalid}` : describeQuery(saved.query, schema),
        appCount: matches.size,
      }
    }),
  ], [queries, savedQueries, schema, definitions, entitlements, audience])
  const availableKeys = useMemo(() => options.map(({ key }) => key), [options])
  const effectiveSelection = useMemo(() => reconcileQueryTiles(selection, availableKeys), [selection, availableKeys])
  const [draft, setDraft] = useState(effectiveSelection)
  const available = new Map(options.map((option) => [option.key, option]))
  const canSave = draft.desktop.length === 6 && new Set(draft.desktop).size === 6
    && draft.desktop.every((key) => available.has(key))
  const tiles = useMemo(() => effectiveSelection[mobile ? "mobile" : "desktop"]
    .map((key) => options.find((option) => option.key === key)).filter(Boolean)
    .map((option) => {
      const matches = option.matches || filterQueryDefinitions(definitions, entitlements, option.query, audience, schema)
      return { ...option, previews: findApps(matches, entitlements, "", audience).slice(0, mobile ? 4 : 5) }
    }), [effectiveSelection, mobile, options, definitions, entitlements, audience, schema])

  function edit() {
    setDraft(reconcileQueryTiles(selection, availableKeys))
    setEditingLayout(mobile ? "mobile" : "desktop")
    setEditOpen(true)
  }

  function toggle(key, layout) {
    setDraft((previous) => ({
      ...previous,
      [layout]: previous[layout].includes(key)
        ? previous[layout].filter((id) => id !== key) : [...previous[layout], key],
    }))
  }

  return (
    <section aria-labelledby="preset-queries-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="preset-queries-title" className="text-xs font-semibold tracking-wider uppercase">Preset queries</h3>
        <Button variant="ghost" size="icon-sm" aria-label="Edit query tiles" title="Edit query tiles" onClick={edit}>
          <IconPencil />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles.map((query) => {
          const Icon = query.presetId ? icons[query.presetId] : IconDeviceFloppy
          const id = query.key.replace(":", "-")
          return (
            <article key={query.key} data-query-tile
              className="flex aspect-square min-w-0 flex-col overflow-hidden border bg-card p-3 md:aspect-auto md:px-5"
              aria-labelledby={`${id}-title ${id}-count`}
              aria-describedby={`${id}-description`}>
              <div className="flex min-h-8 shrink-0 items-start gap-2 md:min-h-6">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-primary md:size-5" />
                <h4 id={`${id}-title`} className="line-clamp-2 text-xs font-medium break-words md:text-sm">{query.title}</h4>
              </div>
              <p id={`${id}-description`} className="sr-only">{query.description}</p>
              {query.previews.length > 0 ? <ul aria-label={`${query.title} app previews`}
                className="my-2 flex min-w-0 gap-1 md:flex-col">
                {query.previews.map(({ appId, app, audienceMap }) => (
                  <li key={appId} className="min-w-0">
                    <button type="button" aria-label={`Open ${app.name || appId} details`}
                      title={`${app.name || appId} by ${app.developerName || "Unknown developer"}`}
                      aria-haspopup="dialog" onClick={() => openApp(appId, audienceMap)}
                      className="flex min-w-0 items-center gap-2 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:w-full">
                      <AppIcon key={app.smallImageUrl || app.largeImageUrl || appId} app={app} compact />
                      <span className="hidden min-w-0 truncate text-sm md:block">{app.name || appId}</span>
                    </button>
                  </li>
                ))}
              </ul> : <p className="my-2 text-[11px] text-muted-foreground md:text-sm">
                {!loaded ? "No apps loaded" : query.invalid ? "Update this saved query in Advanced." : "No matching apps"}
              </p>}
              <button type="button" aria-labelledby={`${id}-title ${id}-count`} aria-describedby={`${id}-description`}
                disabled={!loaded || Boolean(query.invalid)} onClick={() => onSelect(query.query, query.presetId)}
                className="mt-auto flex w-full items-center justify-between gap-1 text-[11px] text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 md:text-xs">
                <span>View all</span>
                <span id={`${id}-count`} className="tabular-nums">
                  {loaded ? `${query.appCount.toLocaleString()} ${query.appCount === 1 ? "app" : "apps"}` : "Not loaded"}
                </span>
              </button>
            </article>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {ringLabel ? `Counts use ${ringLabel}. ` : "Counts use the loaded catalog. "}
        Text search does not change these counts. One app can match multiple queries.
      </p>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit query tiles</DialogTitle>
            <DialogDescription>Choose six desktop tiles and up to four mobile tiles. Clear a selected tile before choosing its replacement. Selection order sets tile order. Each layout is saved separately in this browser.</DialogDescription>
          </DialogHeader>
          <div>
            <Button variant="outline" disabled={!onCreateQuery} onClick={() => {
              setEditOpen(false)
              onCreateQuery()
            }}>Create query</Button>
          </div>
          <Tabs value={editingLayout} onValueChange={setEditingLayout}>
            <TabsList aria-label="Tile layout">
              <TabsTrigger value="desktop">Desktop (6)</TabsTrigger>
              <TabsTrigger value="mobile">Mobile (4)</TabsTrigger>
            </TabsList>
            {[["desktop", 6], ["mobile", 4]].map(([layout, limit]) => (
              <TabsContent key={layout} value={layout} hidden={editingLayout !== layout} className="space-y-3">
                <p role="status" className="text-sm text-muted-foreground">{draft[layout].length} of {limit} tiles selected</p>
                {["Presets", "Saved queries"].map((group) => <fieldset key={group} className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">{group}</legend>
                  {group === "Saved queries" && !savedQueries.length && <p className="text-xs text-muted-foreground">Save a query in Advanced to pin it here.</p>}
                  {options.filter((option) => Boolean(option.presetId) === (group === "Presets")).map((option) => {
                    const checked = draft[layout].includes(option.key)
                    return <label key={option.key} className="flex items-start gap-3 border p-3 text-sm has-disabled:opacity-50">
                      <input type="checkbox" className="mt-1 accent-primary" checked={checked}
                        aria-label={option.title}
                        disabled={!checked && (draft[layout].length >= limit || Boolean(option.invalid))}
                        onChange={() => toggle(option.key, layout)} />
                      <span className="min-w-0 flex-1 break-words">
                        <span className="font-medium">{option.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                      </span>
                      {checked && <span className="text-xs tabular-nums text-muted-foreground">{draft[layout].indexOf(option.key) + 1}</span>}
                    </label>
                  })}
                </fieldset>)}
              </TabsContent>
            ))}
          </Tabs>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={!canSave} onClick={() => {
              onSelectionChange(reconcileQueryTiles(draft, availableKeys))
              setEditOpen(false)
            }}>Save tiles</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
