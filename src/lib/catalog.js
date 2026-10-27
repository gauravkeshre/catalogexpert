import "../../js/utils.js"
import { DataLoader } from "../../js/data-loader.js"
import { SearchEngine } from "../../js/search-engine.js"
import { readCatalogCache, writeCatalogCache } from "./catalog-cache"
import { appDefinitionSchema, buildAppDefinitionSchema } from "./app-definition-schema"
import { recordStatistics } from "./statistics"

let snapshot = {
  definitions: new Map(),
  entitlements: new Map(),
  sources: new Map(),
  loading: false,
  progress: 0,
  message: "",
  error: "",
  warning: "",
  cacheWarning: "",
  fromCache: false,
  capturedAt: null,
  querySchema: appDefinitionSchema,
  statisticsHistory: [],
  statisticsWarning: "",
}
const listeners = new Set()

function publish(changes) {
  const querySchema = changes.definitions
    ? buildAppDefinitionSchema(changes.definitions, snapshot.querySchema) : snapshot.querySchema
  snapshot = { ...snapshot, ...changes, querySchema }
  listeners.forEach((listener) => listener())
}

function statisticsSnapshot(data) {
  try {
    return { statisticsHistory: recordStatistics(data), statisticsWarning: "" }
  } catch (error) {
    console.error("Cannot save catalog statistics history.", error)
    return { statisticsHistory: [], statisticsWarning: "Cannot read or save statistics history in this browser. Current counts are still available." }
  }
}

export const catalog = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => snapshot,
  async load({ refresh = false } = {}) {
    if (snapshot.loading || (!refresh && snapshot.capturedAt)) return
    publish({ loading: true, progress: 0, error: "", cacheWarning: "", message: "Reading the local catalog..." })
    if (!refresh) {
      try {
        const saved = await readCatalogCache()
        if (saved) {
          publish({ ...saved, ...statisticsSnapshot(saved), fromCache: true, loading: false, progress: 100, message: "Loaded the local catalog." })
          return
        }
      } catch (error) {
        console.error("Cannot read the saved catalog.", error)
        publish({ cacheWarning: "Cannot read the local cache. Loading the catalog from the server." })
      }
    }
    publish({ message: "Connecting to the catalog..." })
    const definitions = new Map()
    const entitlements = new Map()
    const loader = new DataLoader(
      (message, progress) => {
        if (message.includes("❌")) {
          publish({
            loading: false,
            error: "Cannot load the catalog. Check your connection, then retry.",
          })
        } else {
          publish({ message, progress })
        }
      },
      (message, type) => publish(type === "error" ? { error: message } : { message }),
      () => {},
      () => {},
      async () => {
        const successfulSources = new Map(
          [...loader.urlToAudienceGroups].filter(([url]) => !loader.failedSources.has(url)),
        )
        const missing = loader.failedSources.size
        if (definitions.size === 0) {
          publish({ loading: false, error: "The catalog returned no app definitions. Retry to load the catalog." })
          return
        }
        const result = {
          definitions,
          entitlements,
          sources: successfulSources,
          warning: missing ? `${missing} sources failed. Results may be incomplete.` : "",
          capturedAt: new Date(),
        }
        let cacheWarning = ""
        try {
          await writeCatalogCache(result)
        } catch (error) {
          console.error("Cannot save the catalog.", error)
          cacheWarning = "Cannot save the local cache. Reloads may show older data or request the catalog again."
        }
        publish({
          ...result,
          ...statisticsSnapshot(result),
          fromCache: false,
          cacheWarning,
          loading: false,
          error: "",
          progress: 100,
        })
      },
      new Map(),
      definitions,
      entitlements,
    )
    void loader.loadAllCatalogConfigurations()
  },
}

export function findApps(definitions, entitlements, query, audience) {
  const engine = new SearchEngine(definitions, entitlements)
  const results = query.trim()
    ? engine.performAdvancedSearch(query.trim())
    : [...definitions].flatMap(([appId, audienceMap]) => {
        const app = audienceMap.values().next().value
        return app ? [{ appId, app, audienceMap, hasEntitlements: entitlements.has(appId) }] : []
      })
  return results
    .filter(({ audienceMap }) => audience === "all" || audienceMap.has(audience))
    .sort((a, b) => Number(b.hasEntitlements) - Number(a.hasEntitlements)
      || (a.app.name || "").localeCompare(b.app.name || ""))
}

export function groupStates(entitlements, audience = "all") {
  const states = new Map()
  for (const [appId, entries] of entitlements) {
    for (const [key, entry] of entries) {
      if (audience !== "all" && key.split(".")[0] !== audience) continue
      const state = entry.state || "Unknown"
      if (!states.has(state)) states.set(state, new Set())
      states.get(state).add(appId)
    }
  }
  return [...states].sort(([, a], [, b]) => b.size - a.size)
}

export function audienceLabel(audience) {
  return window.utils.getAudienceGroupShorthand(audience)
}

export function appEntries(entitlements, appId, audience = "all") {
  return [...(entitlements.get(appId) || [])]
    .filter(([key]) => audience === "all" || key.split(".")[0] === audience)
    .map(([key, entry]) => {
      const [ring, scope, context] = key.split(".")
      return { ...entry, ring, scope, context, key }
    })
}
