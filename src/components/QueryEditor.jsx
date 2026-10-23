import { useState } from "react"
import { IconBrackets, IconChevronRight, IconDeviceFloppy, IconFilter, IconPlayerPlay, IconPlus, IconSparkles, IconTrash, IconX } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  canMatchNonemptyArray, canUseSimple, createCondition, createGroup, defaultField, describeQuery,
  fieldFor, fieldsFor, needsValue, operatorsFor, queryForPreset, validateQuery,
} from "@/lib/app-query"
import { propertyAt, propertyTypes } from "@/lib/app-definition-schema"
import { presetQueries } from "@/lib/preset-queries"

function QuerySelect({ label, value, items, onChange, connector = false }) {
  return (
    <Select value={value} onValueChange={onChange} items={items}>
      <SelectTrigger size="sm" aria-label={label} className={`w-full min-w-0 rounded-lg border-input bg-background px-2 py-1 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:data-[size=sm]:h-8 ${
        connector ? "gap-0 px-0.5 text-[10px] [&>svg]:hidden sm:gap-1 sm:px-1.5 sm:text-xs sm:[&>svg]:block" : ""
      }`}>
        <SelectValue>{connector ? (value === "all" ? "AND" : value === "any" ? "OR" : "NOT") : undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="rounded-lg">
        {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function PropertyPicker({ condition, onChange, schema, derived, path }) {
  const keys = condition.propertyPath || []
  const selectors = []
  for (let depth = 0; depth <= keys.length; depth++) {
    const parent = propertyAt(schema, condition.field, keys.slice(0, depth))
    if (!parent?.properties.size) break
    selectors.push(<div key={depth} className="flex min-w-0 flex-1 items-center gap-1">
      <IconChevronRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <QuerySelect label={`Property ${path}.${depth + 1}`} value={keys[depth] === undefined ? "$self" : JSON.stringify([keys[depth]])}
        items={[{ value: "$self", label: "Object itself" },
          ...[...parent.properties.keys()].sort().map((key) => ({ value: JSON.stringify([key]), label: key }))]}
        onChange={(selected) => onChange({
          ...createCondition(condition.field, undefined, schema,
            selected === "$self" ? keys.slice(0, depth) : [...keys.slice(0, depth), JSON.parse(selected)[0]]),
          id: condition.id,
        })} />
    </div>)
    if (keys[depth] === undefined) break
  }
  const types = propertyTypes(propertyAt(schema, condition.field, keys))
  return <div className={`min-w-0 ${selectors.length || types.length > 1 ? "space-y-1" : ""}`}>
    <div className="flex min-w-0 items-center gap-1">
      <QuerySelect label={`Field ${path}`} value={condition.field}
        items={fieldsFor(schema, derived).map(({ id, label }) => ({ value: id, label }))}
        onChange={(value) => onChange({ ...createCondition(value, undefined, schema), id: condition.id })} />
    </div>
    {selectors}
    {types.length > 1 && <QuerySelect label={`Type ${path}`} value={condition.valueType}
      items={types.map((type) => ({ value: type, label: `${type} value` }))}
      onChange={(type) => onChange({ ...createCondition(condition.field, undefined, schema, keys, type), id: condition.id })} />}
  </div>
}

function Condition({ condition, onChange, onRemove, path, schema, derived, simple }) {
  const field = fieldFor(condition, schema)
  const valueRequired = needsValue(condition.operator)
  const numeric = ["array", "number"].includes(field.type)
  const showItems = field.type === "array" && (canMatchNonemptyArray(condition) || condition.items.children.length > 0)
  return (
    <div className="min-w-0" role="group" aria-label={`Condition ${path}`}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] items-start gap-x-1.5 gap-y-1 py-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1.1fr)_auto] sm:gap-x-2"
        title={`${field.label} (${field.type})`}>
        <PropertyPicker condition={condition} onChange={onChange} schema={schema} derived={derived} path={path} />
        <QuerySelect label={`Operator ${path}`} value={condition.operator}
          items={operatorsFor(condition, schema).map(({ id, label }) => ({ value: id, label }))}
          onChange={(operator) => onChange({ ...condition, operator })} />
        <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
          {valueRequired ? field.values
            ? <QuerySelect label={`Value ${path}`} value={condition.value}
                items={field.values.map(({ id, title }) => ({ value: id, label: title }))}
                onChange={(value) => onChange({ ...condition, value })} />
            : <Input className="h-9 rounded-lg border-input bg-background px-2 py-1 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:h-8" aria-label={`Value ${path}`}
                type={numeric ? "number" : "text"} step={field.type === "array" ? 1 : "any"} min={field.type === "array" ? 0 : undefined}
                placeholder={field.type === "array" ? "Item count" : `Enter ${field.label}...`}
                value={condition.value} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
            : <span className="inline-flex h-9 items-center px-2 text-xs text-muted-foreground sm:h-8">No value needed</span>}
        </div>
        <Button variant="ghost" size="icon-sm"
          className="col-start-3 row-span-2 row-start-1 justify-self-end rounded-lg text-muted-foreground hover:text-destructive sm:col-start-4 sm:row-span-1 sm:size-8"
          aria-label={`Remove condition ${path}`}
          title="Remove condition" onClick={onRemove}><IconX /></Button>
      </div>
      {showItems && <div className="mt-1 min-w-0 space-y-2 rounded-lg border bg-background/60 p-2" role="group" aria-label={`Array items ${path}`}>
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <div className="w-32 max-w-full"><QuerySelect label={`Item match ${path}`} value={condition.quantifier}
            items={[{ value: "any", label: "Any item" }, { value: "all", label: "All items" }]}
            onChange={(quantifier) => onChange({ ...condition, quantifier })} /></div>
          <span className="text-muted-foreground">in {field.label}; rules apply to the same item</span>
        </div>
        {defaultField(field.property.items) ? <Group group={condition.items} path={`${path}.items`}
          schema={field.property.items} derived={false} simple={simple}
          onChange={(items) => onChange({ ...condition, items })} itemScope />
          : <p className="text-xs text-muted-foreground">No item properties are available in this catalog. You can query the count.</p>}
      </div>}
    </div>
  )
}

function Group({ group, onChange, simple, path = "", onRemove, schema, derived, itemScope = false }) {
  function updateChild(id, next) {
    onChange({ ...group, children: group.children.map((child) => child.id === id ? next : child) })
  }
  function removeChild(id) {
    onChange({ ...group, children: group.children.filter((child) => child.id !== id) })
  }
  const matchControl = !simple && <QuerySelect label={path ? `Match group ${path}` : "Match query"} value={group.match}
    items={[{ value: "all", label: "All (AND)" }, { value: "any", label: "Any (OR)" }, { value: "none", label: "None (NOT)" }]}
    onChange={(match) => onChange({ ...group, match })} connector />
  return (
    <div className={`min-w-0 space-y-2 ${itemScope ? "" : "rounded-xl border bg-muted/25 p-2 sm:p-3"}`}
      role="group" aria-label={path ? `Condition group ${path}` : "Query conditions"}>
      {(!simple && group.children.length < 2 || group.match === "none" || onRemove) && <div className="flex min-w-0 items-center gap-2">
        {!simple && group.children.length < 2 && <div className="w-16 shrink-0">{matchControl}</div>}
        <p className="min-w-0 text-xs text-muted-foreground">
          {group.match === "none" ? "Exclude matches to any rule in this group" : path && !itemScope ? "Nested filter" : "Combine filters"}
        </p>
        {onRemove && <Button variant="ghost" size="icon-sm" className="ml-auto rounded-lg text-muted-foreground hover:text-destructive sm:size-8"
          aria-label={`Remove group ${path}`} title="Remove group" onClick={onRemove}><IconX /></Button>}
      </div>}
      <div className="space-y-1">
        {group.children.map((child, index) => {
          const childPath = `${path ? `${path}.` : ""}${index + 1}`
          return <div key={child.id} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-1 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-x-2">
            <div className="flex h-11 min-w-0 items-center text-[10px] text-muted-foreground sm:h-10 sm:text-xs">
              {index === 1 && !simple ? matchControl : <span className="px-0.5 sm:px-2">
                {index === 0 ? "Where" : group.match === "all" ? "AND" : "OR"}
              </span>}
            </div>
            {child.type === "group"
              ? <Group group={child} path={childPath} onChange={(next) => updateChild(child.id, next)}
                  onRemove={() => removeChild(child.id)} schema={schema} derived={derived} />
              : <Condition condition={child} path={childPath} onChange={(next) => updateChild(child.id, next)}
                  onRemove={() => removeChild(child.id)} schema={schema} derived={derived} simple={simple} />}
          </div>
        })}
      </div>
      {!group.children.length && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        {itemScope ? "No item conditions. Only the count is filtered." : path ? "Add a condition to this group." : "No conditions yet. Run as-is to see all apps, or add a condition to narrow the catalog."}
      </p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-2">
        <Button variant="outline" size="sm" aria-label="Add condition" className="rounded-lg bg-background px-2 text-xs font-medium tracking-normal normal-case sm:h-8 sm:px-3"
          onClick={() => onChange({ ...group, children: [...group.children, createCondition(defaultField(schema), undefined, schema)] })}>
          <IconPlus /><span className={path ? "hidden sm:inline" : ""}>Add filter</span>{path && <span className="sm:hidden">Rule</span>}
        </Button>
        {!simple && <Button variant="ghost" size="sm" aria-label="Add group" className="rounded-lg px-2 text-xs font-medium tracking-normal normal-case sm:h-8 sm:px-3"
          onClick={() => onChange({ ...group, children: [...group.children, {
            ...createGroup(), children: [createCondition(defaultField(schema), undefined, schema)],
          }] })}>
          <IconBrackets /><span className={path ? "hidden sm:inline" : ""}>Add nested filter</span>{path && <span className="sm:hidden">Group</span>}
        </Button>}
        {(path || itemScope) && group.children.length > 0 && <Button variant="ghost" size="sm"
          className="ml-auto rounded-lg px-2 text-xs font-medium tracking-normal text-muted-foreground normal-case sm:h-8"
          aria-label={`Clear group ${path}`} onClick={() => onChange({ ...group, children: [] })}>Clear group</Button>}
      </div>
    </div>
  )
}

export default function QueryEditor({ query, onChange, mode, onModeChange, onRun, onReset, loading, hasRun, dirty, schema, onLoadQuery, saved }) {
  const error = validateQuery(query, true, schema)
  const simpleAllowed = canUseSimple(query)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("Untitled query")
  const [saveMessage, setSaveMessage] = useState("")
  const [savedVersion, setSavedVersion] = useState(null)

  function load(next, presetId, name = "Untitled query") {
    onLoadQuery(next, presetId)
    setSaveName(name)
    setSaveMessage("")
  }

  function save(event) {
    event.preventDefault()
    if (!saveName.trim() || error) return
    if (saved.saveQuery(saveName.trim(), query)) {
      setSaveOpen(false)
      setSavedVersion(query)
      setSaveMessage(`Saved "${saveName.trim()}" in this browser.`)
    }
  }

  return (
    <div className="min-w-0 rounded-2xl border bg-card shadow-sm" role="region" aria-label="Query editor">
      {saved.error && <p role="alert" className="border-b p-3 text-sm text-destructive">{saved.error}</p>}
      <Tabs value={mode} onValueChange={onModeChange} className="min-w-0 gap-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 border-b px-3 py-1 sm:px-4">
          <h3 className="flex items-center gap-2 py-2 text-sm font-medium"><IconFilter className="size-4 text-muted-foreground" />Filters</h3>
          <div className="min-w-0 overflow-x-auto">
          <TabsList variant="line" aria-label="Query editor mode">
            <TabsTrigger value="simple" disabled={!simpleAllowed}>Simple</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="prompt">Prompt to query <Badge variant="outline">TODO</Badge></TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
          </TabsList>
          </div>
        </div>
        {["simple", "advanced"].map((editorMode) => <TabsContent key={editorMode} value={editorMode}
          hidden={mode !== editorMode} className="min-w-0 space-y-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">{editorMode === "simple"
            ? "Match every filter. Switch to Advanced to combine AND, OR, and nested groups."
            : "Choose AND, OR, or NOT for each group. The connector applies to every rule in that group."}</p>
          {!simpleAllowed && <p className="text-xs text-muted-foreground">To return to Simple, use All (AND) and remove nested groups.</p>}
          <Group group={query} onChange={onChange} simple={editorMode === "simple"} schema={schema} derived />
        </TabsContent>)}
        <TabsContent value="prompt" hidden={mode !== "prompt"} className="space-y-4 p-5 sm:p-8">
          <IconSparkles className="size-6 text-muted-foreground" />
          <h3 className="font-medium">Describe it. Build a query.</h3>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            TODO: Turn a natural-language prompt into editable query conditions. Prompt generation is not implemented.
          </p>
          <p className="border-l-2 pl-4 text-sm text-muted-foreground">
            For example: "Find Teams-owned apps with bots or message extensions."
          </p>
          <Button variant="outline" onClick={() => onModeChange(simpleAllowed ? "simple" : "advanced")}>Back to editor</Button>
        </TabsContent>
        <TabsContent value="presets" hidden={mode !== "presets"} className="min-w-0 space-y-5 p-3 sm:p-4">
          <div><h3 className="font-medium">Start with a preset</h3>
            <p className="mt-1 text-sm text-muted-foreground">Load its property conditions, tune them, then run. Your current results stay unchanged.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {presetQueries.map((preset) => {
              const next = queryForPreset(preset.id, schema)
              return <button key={preset.id} onClick={() => load(next, preset.id, preset.title)}
                className="min-w-0 space-y-2 border p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Use preset ${preset.title}`}>
                <p className="font-medium">{preset.title}</p>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
                <p className="line-clamp-3 font-mono text-[11px] break-words text-muted-foreground">{describeQuery(next, schema)}</p>
              </button>
            })}
          </div>
          <div className="space-y-3">
            <h3 className="font-medium">Saved queries</h3>
            {!saved.queries.length && <p className="text-sm text-muted-foreground">Save a query to reuse it here. Saved queries stay in this browser.</p>}
            {saved.queries.map((entry) => {
              const invalid = validateQuery(entry.query, true, schema)
              return <div key={entry.id} className="flex min-w-0 items-center gap-2 border p-2">
                <button className="min-w-0 flex-1 space-y-1 p-1 text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  disabled={Boolean(invalid)} onClick={() => load(entry.query, undefined, entry.name)} aria-label={`Load saved query ${entry.name}`}>
                  <p className="text-sm font-medium break-words">{entry.name}</p>
                  <p className="line-clamp-2 text-xs break-words text-muted-foreground">{invalid || describeQuery(entry.query, schema)}</p>
                </button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete saved query ${entry.name}`} onClick={() => saved.deleteQuery(entry.id)}><IconTrash /></Button>
              </div>
            })}
          </div>
        </TabsContent>
      </Tabs>
      <div className="space-y-3 rounded-b-2xl border-t bg-muted/20 p-3 sm:p-4">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Query preview</p>
          <p className="text-sm leading-relaxed break-words" aria-label="Query preview">{describeQuery(query, schema)}</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {mode !== "prompt" && <div className="flex flex-wrap gap-2">
            <Button onClick={onRun} disabled={Boolean(error) || loading}><IconPlayerPlay />Run query</Button>
            <Button variant="ghost" onClick={onReset}>Clear query</Button>
          </div>}
          <p role="status" aria-label="Query status" className="flex-1 text-xs text-muted-foreground">
            {hasRun ? dirty ? "Unapplied changes. Run query to update results." : "Query applied" : "Ready when you are"}
          </p>
          <Button variant="outline" className="ml-auto" onClick={() => { setSaveMessage(""); setSaveOpen(true) }}
            disabled={Boolean(error)}><IconDeviceFloppy />Save query</Button>
        </div>
        {saveMessage && savedVersion === query && <p role="status" className="text-right text-xs text-muted-foreground">{saveMessage}</p>}
      </div>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Save query</DialogTitle>
            <DialogDescription>Save the current conditions in this browser. Catalog data is not included.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="query-name">Query name</Label>
              <Input id="query-name" value={saveName} maxLength={120} onChange={(event) => setSaveName(event.target.value)} autoFocus required /></div>
            {saved.queries.some((entry) => entry.name.toLowerCase() === saveName.trim().toLowerCase())
              && <p className="text-sm text-muted-foreground">Saving this name replaces its existing saved conditions.</p>}
            {saved.error && <p role="alert" className="text-sm text-destructive">{saved.error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!saveName.trim() || Boolean(error)}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
