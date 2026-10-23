import { expect, test } from "@playwright/test"
import { defaultPresetQueries } from "../src/lib/preset-queries.js"
import { reconcileQueryTiles } from "../src/lib/query-tiles.js"

const defaults = defaultPresetQueries.map(({ id }) => `preset:${id}`)

test("retains all six default desktop tiles and the default mobile selection", () => {
  expect(defaults).toEqual([
    "preset:customEngine", "preset:declarative", "preset:bots",
    "preset:tabs", "preset:botOnly", "preset:messageExtensions",
  ])
  const selection = { desktop: [...defaults], mobile: defaults.slice(0, 4) }
  expect(reconcileQueryTiles(selection, defaults)).toEqual(selection)
})

test("retains custom replacements and selection order", () => {
  const selection = {
    desktop: ["saved:second", "preset:spfx", defaults[3], "saved:first", defaults[0], defaults[5]],
    mobile: ["saved:first", "preset:spfx", defaults[3]],
  }
  const available = [...defaults, "preset:spfx", "saved:first", "saved:second"]
  expect(reconcileQueryTiles(selection, available)).toEqual(selection)
})

test("fills legacy shorter desktop selections with unselected defaults in default order", () => {
  const selection = { desktop: [defaults[3], "saved:custom"], mobile: [defaults[5]] }
  expect(reconcileQueryTiles(selection, [...defaults, "saved:custom"])).toEqual({
    desktop: [defaults[3], "saved:custom", defaults[0], defaults[1], defaults[2], defaults[4]],
    mobile: [defaults[5]],
  })
})

test("extra available queries do not add or replace selected tiles", () => {
  const savedKeys = Array.from({ length: 100 }, (_, index) => `saved:${index}`)
  const selection = { desktop: [...defaults], mobile: [defaults[2]] }
  expect(reconcileQueryTiles(selection, [...defaults, "preset:spfx", ...savedKeys])).toEqual(selection)
})

test("does not limit which saved queries can be selected", () => {
  const savedKeys = Array.from({ length: 100 }, (_, index) => `saved:${index}`)
  const selection = {
    desktop: savedKeys.slice(-6).reverse(),
    mobile: savedKeys.slice(-4),
  }
  expect(reconcileQueryTiles(selection, [...defaults, ...savedKeys])).toEqual(selection)
})

test("removes unknown and deleted keys before restoring desktop defaults", () => {
  const selection = {
    desktop: ["saved:deleted", defaults[2], "preset:deleted", "saved:kept"],
    mobile: ["preset:deleted", "saved:kept", "saved:deleted", defaults[4]],
  }
  expect(reconcileQueryTiles(selection, [...defaults, "saved:kept"])).toEqual({
    desktop: [defaults[2], "saved:kept", defaults[0], defaults[1], defaults[3], defaults[4]],
    mobile: ["saved:kept", defaults[4]],
  })
})

test("deduplicates each selection without changing its order", () => {
  const selection = {
    desktop: ["saved:custom", "saved:custom", defaults[2], defaults[2], defaults[0]],
    mobile: [defaults[2], defaults[2], "saved:custom", "saved:custom", defaults[0]],
  }
  expect(reconcileQueryTiles(selection, [...defaults, "saved:custom", "saved:custom"])).toEqual({
    desktop: ["saved:custom", defaults[2], defaults[0], defaults[1], defaults[3], defaults[4]],
    mobile: [defaults[2], "saved:custom", defaults[0]],
  })
})

test("caps desktop at six and mobile at four after filtering and deduplicating", () => {
  const selection = {
    desktop: ["saved:deleted", "saved:custom", "saved:custom", ...defaults, "preset:spfx"],
    mobile: ["saved:deleted", defaults[5], defaults[5], "saved:custom", ...defaults],
  }
  expect(reconcileQueryTiles(selection, [...defaults, "saved:custom", "preset:spfx"])).toEqual({
    desktop: ["saved:custom", ...defaults.slice(0, 5)],
    mobile: [defaults[5], "saved:custom", defaults[0], defaults[1]],
  })
})

test("restores empty desktop selections without filling empty mobile selections", () => {
  expect(reconcileQueryTiles({ desktop: [], mobile: [] }, defaults)).toEqual({
    desktop: defaults,
    mobile: [],
  })
  expect(reconcileQueryTiles({
    desktop: ["saved:deleted"], mobile: ["saved:deleted"],
  }, defaults)).toEqual({ desktop: defaults, mobile: [] })
})

test("handles absent selections without adding mobile tiles", () => {
  for (const selection of [undefined, null, {}, { desktop: null, mobile: null }]) {
    expect(reconcileQueryTiles(selection, defaults)).toEqual({ desktop: defaults, mobile: [] })
  }
})

test("does not mutate inputs and returns independent objects and arrays", () => {
  const selection = Object.freeze({
    desktop: Object.freeze([defaults[2], "saved:custom", defaults[2]]),
    mobile: Object.freeze(["saved:custom", "saved:custom"]),
  })
  const available = Object.freeze([...defaults, "saved:custom"])
  const result = reconcileQueryTiles(selection, available)
  const second = reconcileQueryTiles(selection, available)

  expect(result).not.toBe(selection)
  expect(result.desktop).not.toBe(selection.desktop)
  expect(result.mobile).not.toBe(selection.mobile)
  expect(result).not.toBe(second)
  expect(result.desktop).not.toBe(second.desktop)
  expect(result.mobile).not.toBe(second.mobile)
  expect(result.desktop).not.toBe(result.mobile)
  expect(selection).toEqual({
    desktop: [defaults[2], "saved:custom", defaults[2]],
    mobile: ["saved:custom", "saved:custom"],
  })
  expect(available).toEqual([...defaults, "saved:custom"])
  result.desktop[0] = "saved:changed"
  result.mobile.push(defaults[0])
  expect(second.desktop[0]).toBe(defaults[2])
  expect(second.mobile).toEqual(["saved:custom"])
})

test("throws a descriptive error when a required default is unavailable", () => {
  const available = defaults.slice(1)
  expect(() => reconcileQueryTiles({ desktop: [], mobile: [] }, available))
    .toThrow(new RangeError(
      `Cannot reconcile query tiles. Required default preset keys are unavailable: ${defaults[0]}`,
    ))
  expect(() => reconcileQueryTiles({ desktop: [], mobile: [] }, []))
    .toThrow(`Required default preset keys are unavailable: ${defaults.join(", ")}`)
})

test("rejects missing defaults even when six custom selections are available", () => {
  const savedKeys = Array.from({ length: 6 }, (_, index) => `saved:${index}`)
  expect(() => reconcileQueryTiles({ desktop: savedKeys, mobile: [] }, savedKeys))
    .toThrow(RangeError)
})
