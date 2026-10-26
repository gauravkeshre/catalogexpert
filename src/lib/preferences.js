import { useState } from "react"
import { defaultPresetQueries } from "./preset-queries.js"

const STORAGE_KEY = "catalog-explorer.preferences.v1"
export const defaultPreferences = {
  theme: "system",
  viewMode: "list",
  showRings: false,
  showStats: false,
  showDescriptions: false,
  showIds: false,
  showEntitlements: true,
  mutedProperties: [],
  queryTiles: {
    desktop: defaultPresetQueries.map(({ id }) => `preset:${id}`),
    mobile: defaultPresetQueries.slice(0, 4).map(({ id }) => `preset:${id}`),
  },
}

function validTileSelection(value, limit) {
  return Array.isArray(value) && value.length <= limit && new Set(value).size === value.length
    && value.every((id) => typeof id === "string" && /^(preset|saved):.+$/.test(id))
}

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      throw new Error("Invalid display settings")
    }
    const preferences = { ...defaultPreferences }
    for (const key of Object.keys(preferences)) {
      if (key === "mutedProperties" && saved[key] !== undefined) {
        if (!Array.isArray(saved[key]) || !saved[key].every((property) => typeof property === "string")
          || new Set(saved[key]).size !== saved[key].length) {
          throw new Error("Invalid muted property settings")
        }
        preferences[key] = saved[key]
      } else if (key === "queryTiles" && saved[key] !== undefined) {
        if (!saved[key] || !validTileSelection(saved[key].desktop, 6) || !validTileSelection(saved[key].mobile, 4)) {
          throw new Error("Invalid query tile settings")
        }
        preferences[key] = saved[key]
      } else if (key === "theme") {
        if (["light", "dark", "system"].includes(saved[key])) preferences[key] = saved[key]
      } else if (key === "viewMode") {
        if (["list", "grid"].includes(saved[key])) preferences[key] = saved[key]
      } else if (typeof saved[key] === "boolean") {
        preferences[key] = saved[key]
      }
    }
    return { preferences, error: "" }
  } catch (error) {
    console.error("Cannot read display settings.", error)
    return { preferences: { ...defaultPreferences }, error: "Cannot read saved settings. Default settings apply." }
  }
}

export function usePreferences() {
  const [state, setState] = useState(readPreferences)

  function updatePreferences(changes) {
    const preferences = { ...state.preferences, ...changes }
    let error = ""
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch (cause) {
      console.error("Cannot save display settings.", cause)
      error = "Cannot save settings. Changes apply to this session only."
    }
    setState({ preferences, error })
  }

  return { ...state, updatePreferences }
}
