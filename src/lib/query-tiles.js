import { defaultPresetQueries } from "./preset-queries.js"

const defaultDesktopKeys = defaultPresetQueries.map(({ id }) => `preset:${id}`)

function retainSelection(selection, available, limit) {
  if (!Array.isArray(selection)) return []
  return [...new Set(selection.filter((key) => available.has(key)))].slice(0, limit)
}

export function reconcileQueryTiles(selection, availableKeys) {
  const available = new Set(availableKeys)
  const missingDefaults = defaultDesktopKeys.filter((key) => !available.has(key))
  if (missingDefaults.length) {
    throw new RangeError(`Cannot reconcile query tiles. Required default preset keys are unavailable: ${missingDefaults.join(", ")}`)
  }

  const desktop = retainSelection(selection?.desktop, available, 6)
  for (const key of defaultDesktopKeys) {
    if (desktop.length === 6) break
    if (!desktop.includes(key)) desktop.push(key)
  }

  return {
    desktop,
    mobile: retainSelection(selection?.mobile, available, 4),
  }
}
