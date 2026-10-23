import AppIcon from "@/components/AppIcon"

export default function AppGrid({ results, audience = "all", openApp }) {
  return (
    <section aria-label="App grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {results.map(({ appId, app, audienceMap }) => {
        const displayedApp = audience === "all" ? app : audienceMap.get(audience)
        const name = displayedApp.name || appId
        const developer = displayedApp.developerName || "Unknown developer"

        return (
          <button
            key={appId}
            type="button"
            aria-label={`${name} by ${developer}`}
            aria-haspopup="dialog"
            onClick={() => openApp(appId)}
            className="flex min-w-0 cursor-pointer items-start gap-3 rounded-none border bg-card p-4 text-left text-card-foreground transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <AppIcon app={displayedApp} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block text-sm font-medium">{name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{developer}</span>
            </span>
          </button>
        )
      })}
    </section>
  )
}
