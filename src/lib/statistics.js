import { countPresetQueries, filterPresetDefinitions, presetQueries } from "./preset-queries.js"
import { filterQueryDefinitions } from "./app-query.js"

export const statisticsHistoryKey = "catalog-explorer-statistics-v1"
const historyLimit = 90

export function statisticsSourceKey(sources) {
  return JSON.stringify([...sources].map(([url, rings]) => [url, [...rings].sort()])
    .sort(([a], [b]) => a.localeCompare(b)))
}

export function statisticsCounts(definitions, audience = "all") {
  return {
    all: [...definitions.values()].filter((variants) => audience === "all" || variants.has(audience)).length,
    ...Object.fromEntries(countPresetQueries(definitions, audience).map(({ id, appCount }) => [id, appCount])),
  }
}

export function recordStatistics(data, storage = window.localStorage) {
  const raw = storage.getItem(statisticsHistoryKey)
  const history = raw === null ? [] : JSON.parse(raw)
  const ids = ["all", ...presetQueries.map(({ id }) => id)]
  if (!Array.isArray(history) || history.some((entry) =>
    !entry || !Number.isFinite(Date.parse(entry.capturedAt)) || typeof entry.sources !== "string"
    || !entry.scopes || !Object.hasOwn(entry.scopes, "all")
    || Object.values(entry.scopes).some((counts) => !counts || ids.some((id) =>
      !Number.isSafeInteger(counts[id]) || counts[id] < 0)))) {
    throw new Error("The saved statistics history is invalid.")
  }
  if (!data.capturedAt || !data.definitions.size || data.warning) return history
  const capturedAt = data.capturedAt.toISOString()
  if (history.some((entry) => entry.capturedAt === capturedAt)) return history
  const rings = [...new Set([...data.definitions.values()].flatMap((variants) => [...variants.keys()]))]
  const snapshot = {
    capturedAt,
    sources: statisticsSourceKey(data.sources),
    scopes: Object.fromEntries(["all", ...rings].map((ring) => [ring, statisticsCounts(data.definitions, ring)])),
  }
  const next = [...history, snapshot]
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)).slice(-historyLimit)
  storage.setItem(statisticsHistoryKey, JSON.stringify(next))
  return next
}

export function groupingProperties(schema, path = []) {
  if (!schema) return []
  const scalar = [...schema.types].some((type) => ["string", "number", "boolean"].includes(type))
  return [
    ...(scalar && path.length ? [{ value: JSON.stringify(path), label: path.join(".") }] : []),
    ...[...schema.properties].flatMap(([key, property]) => groupingProperties(property, [...path, key])),
    ...(schema.items ? groupingProperties(schema.items, path) : []),
  ].filter((item, index, items) => items.findIndex(({ value }) => value === item.value) === index)
}

function propertyValues(value, path) {
  if (Array.isArray(value)) return value.flatMap((item) => propertyValues(item, path))
  if (path.length) return propertyValues(value?.[path[0]], path.slice(1))
  return ["string", "number", "boolean"].includes(typeof value) && value !== ""
    ? [typeof value === "boolean" ? value ? "Yes" : "No" : String(value)] : []
}

export function groupStatistics(definitions, entitlements, property) {
  const groups = new Map()
  for (const [appId, variants] of definitions) {
    const values = new Set()
    for (const [ring, app] of variants) {
      const entries = property === "$rings" ? [ring]
        : property === "$entitlements"
          ? [...(entitlements.get(appId) || [])].filter(([key]) => key.split(".")[0] === ring)
            .map(([, entry]) => entry.state || "Unknown")
          : propertyValues(app, JSON.parse(property))
      entries.forEach((value) => values.add(value))
    }
    if (!values.size) values.add("Not specified")
    for (const value of values) groups.set(value, (groups.get(value) || 0) + 1)
  }
  return [...groups].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function chartGroups(groups, limit = 7) {
  return groups.length <= limit ? groups : [
    ...groups.slice(0, limit - 1),
    { label: "Other groups (combined)", count: groups.slice(limit - 1).reduce((sum, group) => sum + group.count, 0) },
  ]
}

export function calculateStatistics({ definitions, entitlements, schema, query, audience, type, grouping }) {
  const scoped = type === "all" ? definitions : filterPresetDefinitions(definitions, type, audience)
  const matching = filterQueryDefinitions(scoped, entitlements,
    query || { type: "group", match: "all", children: [] }, audience, schema)
  const developers = new Set()
  let variants = 0
  let entitledApps = 0
  for (const [appId, entries] of matching) {
    variants += entries.size
    for (const app of entries.values()) {
      if (app.developerName) developers.add(app.developerName)
    }
    if ([...(entitlements.get(appId) || [])].some(([key]) => entries.has(key.split(".")[0]))) entitledApps++
  }
  return {
    appCount: matching.size,
    counts: statisticsCounts(matching),
    properties: groupingProperties(schema).sort((a, b) => a.label.localeCompare(b.label)),
    groups: groupStatistics(matching, entitlements, grouping),
    variants,
    developers: developers.size,
    entitledApps,
  }
}
