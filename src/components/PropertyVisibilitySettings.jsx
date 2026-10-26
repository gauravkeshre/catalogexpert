import { useRef, useState } from "react"
import { IconSearch } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { groupDefinitionNodes } from "@/lib/definition-groups"

export default function PropertyVisibilitySettings({ schema, mutedProperties, onChange }) {
  const searchInput = useRef(null)
  const [search, setSearch] = useState("")
  const [previouslyMuted] = useState(mutedProperties)
  const muted = new Set(mutedProperties)
  const keys = new Set([...schema.properties.keys(), "audienceGroup", ...previouslyMuted, ...mutedProperties])
  const query = search.trim().toLowerCase()
  const groups = groupDefinitionNodes([...keys].sort().map((key) => ({ key })))
    .map(([label, nodes]) => [label, nodes.filter(({ key }) => label.toLowerCase().includes(query) || key.toLowerCase().includes(query))])
    .filter(([, nodes]) => nodes.length)

  function toggle(key) {
    const next = new Set(muted)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange([...next])
  }

  return (
    <Card role="region" aria-labelledby="detail-properties-title">
      <CardHeader>
        <CardTitle id="detail-properties-title">App detail properties</CardTitle>
        <CardDescription>
          Select top-level properties to mute for all apps. Each selection also hides nested values.
          Muting applies to detail tabs and copied JSON. Catalog data and exports stay unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-0 basis-48 grow">
            <IconSearch aria-hidden="true" className="pointer-events-none absolute top-3 left-2 size-4 text-muted-foreground" />
            <Input ref={searchInput} aria-label="Search app detail properties" placeholder="Search properties or groups" value={search}
              onChange={(event) => setSearch(event.target.value)} className="pl-8" />
          </div>
          {search && <Button variant="ghost" size="xs" onClick={() => { searchInput.current.focus(); setSearch("") }}>Clear search</Button>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-muted-foreground">{muted.size} {muted.size === 1 ? "property" : "properties"} muted</p>
          <Button variant="outline" size="sm" disabled={!muted.size} onClick={() => onChange([])}>Restore all properties</Button>
        </div>
        <div className="max-h-80 space-y-4 overflow-y-auto border p-3">
          {groups.length ? groups.map(([label, nodes]) => (
            <fieldset key={label} className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-semibold">{label}</legend>
              {nodes.map(({ key }) => (
                <label key={key} className="flex cursor-pointer items-start gap-3 py-1 text-sm">
                  <input type="checkbox" checked={muted.has(key)} aria-label={`Mute ${key === "" ? '""' : key}`}
                    onChange={() => toggle(key)} className="mt-0.5 size-4 shrink-0 accent-primary" />
                  <span className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{key === "" ? '""' : key}</span>
                </label>
              ))}
            </fieldset>
          )) : <p role="status" className="text-sm text-muted-foreground">No matching properties.</p>}
        </div>
      </CardContent>
    </Card>
  )
}
