import { useId, useState } from "react"
import CopyButton from "@/components/CopyButton"
import DefinitionExplorer from "@/components/DefinitionExplorer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { appEntries, audienceLabel } from "@/lib/catalog"

function Value({ value }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">Not specified</span>
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") {
    return <pre className="max-h-64 overflow-auto bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
  }
  return <span className="break-all">{String(value)}</span>
}

function Properties({ entries }) {
  if (!entries.length) return <p className="py-3 text-sm text-muted-foreground">No fields to show.</p>
  return <dl className="divide-y">{entries.map(([key, value, action]) => (
    <div key={key} className="grid gap-2 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-xs font-medium break-all text-muted-foreground">{key}</dt>
      <dd className="min-w-0 text-sm">
        {action ? <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><Value value={value} /></div>{action}
        </div> : <Value value={value} />}
      </dd>
    </div>
  ))}</dl>
}

function MutedProperties({ entries }) {
  const panelId = useId()
  const [expanded, setExpanded] = useState(false)
  if (!entries.length) return null
  return (
    <div className="min-w-0 border-t pt-3">
      <Button variant="link" size="sm" className="h-auto max-w-full px-0 whitespace-normal text-left"
        aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((previous) => !previous)}>
        {expanded ? "Hide" : "Show"} muted properties ({entries.length})
      </Button>
      <div id={panelId} role="region" aria-label="Muted properties" hidden={!expanded}>
        {expanded && <>
          <p className="mt-3 text-xs text-muted-foreground">Shown temporarily. Saved settings and copied JSON stay unchanged.</p>
          <Properties entries={entries} />
        </>}
      </div>
    </div>
  )
}

function DefinitionDetails({ appId, audienceMap, entitlements, preferences }) {
  const [variant, setVariant] = useState(audienceMap.keys().next().value)
  const sourceApp = audienceMap.get(variant) || audienceMap.values().next().value
  const muted = new Set(preferences.mutedProperties)
  const app = Object.fromEntries(Object.entries(sourceApp).filter(([key]) => !muted.has(key)))
  const mutedEntries = Object.entries(sourceApp).filter(([key]) => muted.has(key))
  const showRings = preferences.showRings && !muted.has("audienceGroup")
  const entries = appEntries(entitlements, appId)
  const variants = [...audienceMap]
  const visibleJson = JSON.stringify(app, null, 2)
  const variantItems = variants.map(([ring, definition], index) => ({
    value: ring,
    label: `${showRings ? audienceLabel(ring) : `Variant ${index + 1}`}${muted.has("version") ? "" : ` · ${definition.version || "Unknown version"}`}`,
  }))
  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8 break-words">{app.name || (muted.has("id") ? "App details" : appId)}</DialogTitle>
        <DialogDescription>{muted.has("developerName") ? "Selected app details" : app.developerName || "Unknown developer"}</DialogDescription>
      </DialogHeader>
      <Select value={variant} onValueChange={setVariant} items={variantItems}>
        <SelectTrigger aria-label="App variant" className="max-w-full"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {variantItems.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Tabs defaultValue="summary" className="min-w-0 gap-5">
        <div className="min-w-0 overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="entitlements">Entitlements</TabsTrigger>
            <TabsTrigger value="definition">Definition</TabsTrigger>
            <TabsTrigger value="technical">Technical</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="summary" className="space-y-5">
          {app.description && <p className="text-sm leading-relaxed text-muted-foreground">{app.description}</p>}
          <Properties entries={[
            ["id", "App ID", appId, <CopyButton value={appId} label="app ID" iconOnly />],
            ["version", "Version", app.version], ["developerName", "Developer", app.developerName],
          ].filter(([key]) => !muted.has(key)).map(([, ...entry]) => entry)} />
          <div className="flex flex-wrap gap-2">
            {[["isCoreApp", "Core app"], ["isTeamsOwned", "Teams owned"], ["isPinnable", "Pinnable"], ["isPreinstallable", "Preinstallable"], ["isBlockable", "Blockable"], ["isFullTrust", "Full trust"]]
              .filter(([key]) => app[key]).map(([key, label]) => <Badge variant="secondary" key={key}>{label}</Badge>)}
            {[...(app.categories || []), ...(app.industries || [])].map((category, index) => <Badge key={`${category}-${index}`} variant="outline">{String(category)}</Badge>)}
          </div>
          {preferences.showEntitlements && <p className="text-xs text-muted-foreground">{entries.length} configured entitlements</p>}
        </TabsContent>
        <TabsContent value="versions">
          <Table aria-label="App versions">
            <TableHeader><TableRow>{showRings && <TableHead>Ring</TableHead>}<TableHead>Variant</TableHead>{!muted.has("version") && <TableHead>Version</TableHead>}{!muted.has("sourceType") && <TableHead>Source</TableHead>}</TableRow></TableHeader>
            <TableBody>{variants.map(([ring, definition], index) => (
              <TableRow key={ring}>{showRings && <TableCell>{audienceLabel(ring)}</TableCell>}
                <TableCell>{index + 1}</TableCell>{!muted.has("version") && <TableCell>{definition.version || "Unknown"}</TableCell>}{!muted.has("sourceType") && <TableCell>{definition.sourceType || "Unknown"}</TableCell>}
              </TableRow>
            ))}</TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="entitlements">
          {entries.length ? <Table aria-label="App entitlements">
            <TableHeader><TableRow>{showRings && <TableHead>Ring</TableHead>}<TableHead>Scope</TableHead><TableHead>Context</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
            <TableBody>{entries.map((entry) => <TableRow key={entry.key}>
              {showRings && <TableCell>{audienceLabel(entry.ring)}</TableCell>}
              <TableCell>{entry.scope}</TableCell><TableCell>{entry.context}</TableCell><TableCell>{entry.state || "Unknown"}</TableCell>
            </TableRow>)}</TableBody>
          </Table> : <p className="py-8 text-sm text-muted-foreground">No configured entitlements.</p>}
        </TabsContent>
        <TabsContent value="definition">
          <DefinitionExplorer key={variant} value={Object.fromEntries(Object.entries(app).filter(([key]) => preferences.showRings || key !== "audienceGroup"))} />
        </TabsContent>
        <TabsContent value="technical">
          <Properties entries={[
            ["manifestVersion", "Manifest version", app.manifestVersion],
            ["officeAssetId", "Office asset ID", app.officeAssetId],
            ["lastUpdatedAt", "Last updated", app.lastUpdatedAt],
            ["developerUrl", "Developer URL", app.developerUrl],
            ["sourceType", "Source type", app.sourceType],
          ].filter(([key]) => !muted.has(key)).map(([, ...entry]) => entry)} />
        </TabsContent>
        <TabsContent value="json" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">JSON omits muted properties. Other display settings do not remove source fields.</p>
            <CopyButton value={visibleJson} label="JSON" />
          </div>
          <pre className="max-h-[50dvh] overflow-auto border bg-muted/50 p-4 font-mono text-xs whitespace-pre-wrap break-all">{visibleJson}</pre>
        </TabsContent>
      </Tabs>
      <MutedProperties key={variant} entries={mutedEntries} />
    </>
  )
}

export default function AppDetails({ appId, open, definitions, entitlements, preferences, onClose }) {
  const audienceMap = definitions.get(appId)
  return (
    <Dialog open={open && Boolean(audienceMap)} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-4xl">
        {audienceMap && <DefinitionDetails key={appId} appId={appId} audienceMap={audienceMap} entitlements={entitlements} preferences={preferences} />}
      </DialogContent>
    </Dialog>
  )
}
