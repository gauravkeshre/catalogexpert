import { useId, useState } from "react"
import { IconDownload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const exportFields = [
  { key: "name", label: "App Name" },
  { key: "id", label: "App ID" },
  { key: "developerName", label: "Developer" },
]

export default function ExportResults({ results, query, audience }) {
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState("full")
  const [selectedFields, setSelectedFields] = useState(exportFields.map(({ key }) => key))
  const [error, setError] = useState("")
  const noFields = mode === "fields" && !selectedFields.length

  function download(event) {
    event.preventDefault()
    if (noFields) {
      setError("Select at least one field to export.")
      return
    }
    let url
    try {
      const payload = mode === "full" ? {
        exportedAt: new Date().toISOString(), query, audience, appCount: results.length,
        apps: results.map(({ appId, audienceMap }) => ({
          appId, variants: [...audienceMap].filter(([ring]) => audience === "all" || ring === audience)
            .map(([ring, definition]) => ({ ring, definition })),
        })),
      } : results.map(({ appId, app, audienceMap }) => {
        const definition = audience === "all" ? app : audienceMap.get(audience)
        const values = { name: definition.name ?? null, id: appId, developerName: definition.developerName ?? null }
        return Object.fromEntries(exportFields.filter(({ key }) => selectedFields.includes(key))
          .map(({ key }) => [key, values[key]]))
      })
      url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }))
      const link = document.createElement("a")
      link.href = url
      link.download = mode === "full" ? "catalog-results.json" : "catalog-results-fields.json"
      link.click()
      setError("")
      setOpen(false)
    } catch (cause) {
      console.error("Cannot export query results.", cause)
      setError("Cannot export results. Try again or check this browser's download permissions.")
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }

  return <div className="flex max-w-full flex-col items-end gap-1">
    <Button variant="outline" size="sm" onClick={() => { setError(""); setOpen(true) }} disabled={!results.length}
      title="Choose which data to export for all matching apps">
      <IconDownload />Export results
    </Button>
    {!open && error && <p role="alert" className="max-w-sm text-xs text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export results</DialogTitle>
          <DialogDescription>Choose what to export for all {results.length.toLocaleString()} matching apps, not just the current page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={download} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium">What to export</legend>
            <div className="flex items-start gap-3 border p-3">
              <input id={`${formId}-full`} type="radio" name={`${formId}-mode`} value="full"
                checked={mode === "full"} onChange={() => { setMode("full"); setError("") }}
                aria-describedby={`${formId}-full-description`} className="mt-0.5 size-4 shrink-0 accent-primary" />
              <div className="space-y-1">
                <Label htmlFor={`${formId}-full`}>Full dump</Label>
                <p id={`${formId}-full-description`} className="text-xs leading-relaxed text-muted-foreground">
                  Complete matching definition variants, source properties, and applied-query metadata.
                </p>
              </div>
            </div>
            <div className="space-y-3 border p-3">
              <div className="flex items-start gap-3">
                <input id={`${formId}-fields`} type="radio" name={`${formId}-mode`} value="fields"
                  checked={mode === "fields"} onChange={() => { setMode("fields"); setError("") }}
                  aria-describedby={`${formId}-fields-description`} className="mt-0.5 size-4 shrink-0 accent-primary" />
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-fields`}>Selected fields</Label>
                  <p id={`${formId}-fields-description`} className="text-xs leading-relaxed text-muted-foreground">
                    One entry per app, with only the fields you choose. No definitions or query metadata.
                  </p>
                </div>
              </div>
              <fieldset disabled={mode !== "fields"} className="space-y-3 pl-7 disabled:opacity-50">
                <legend className="sr-only">Fields to export</legend>
                {exportFields.map(({ key, label }) => <div key={key} className="flex items-center gap-3">
                  <input id={`${formId}-${key}`} type="checkbox" checked={selectedFields.includes(key)}
                    onChange={(event) => {
                      setSelectedFields((fields) => event.target.checked ? [...fields, key] : fields.filter((field) => field !== key))
                      setError("")
                    }} className="size-4 shrink-0 accent-primary" />
                  <Label htmlFor={`${formId}-${key}`}>{label}</Label>
                </div>)}
              </fieldset>
            </div>
          </fieldset>
          {noFields && <p role="alert" className="text-sm text-destructive">Select at least one field to export.</p>}
          {error && !noFields && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={noFields || !results.length}><IconDownload />Export JSON</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
