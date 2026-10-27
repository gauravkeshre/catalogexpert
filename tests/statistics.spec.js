import { expect, test } from "@playwright/test"
import { buildAppDefinitionSchema } from "../src/lib/app-definition-schema.js"
import { calculateStatistics, chartGroups, groupingProperties, groupStatistics, recordStatistics, statisticsCounts, statisticsHistoryKey } from "../src/lib/statistics.js"
import { createCondition, createGroup } from "../src/lib/app-query.js"

const bot = { id: "agent", name: "Agent", developerName: "Contoso", customEngineCopilots: [{ id: "cea" }],
  bots: [{ id: "bot", scopes: ["personal", "team"] }], categories: ["Productivity", "Productivity"], isTeamsOwned: false }
const tab = { id: "agent", name: "Preview Agent", developerName: "Microsoft", copilotGpts: [{ id: "da" }],
  staticTabs: [{ id: "tab" }], categories: ["Productivity", "Business"], isTeamsOwned: true }
const definitions = new Map([
  ["agent", new Map([["general", bot], ["ring0", tab]])],
  ["other", new Map([["general", { id: "other", developerName: "Contoso", bots: [{ id: "other" }] }]])],
])

function storage(initial) {
  let value = initial ?? null
  return { getItem: () => value, setItem: (_, next) => { value = next } }
}

function catalogData(changes = {}) {
  return {
    definitions, sources: new Map([["https://catalog.test/apps.json", new Set(["general", "ring0"])]]),
    capturedAt: new Date("2026-10-01T00:00:00Z"), warning: "", ...changes,
  }
}

test("statistics count unique apps per capability and scope without merging capabilities across variants", () => {
  expect(statisticsCounts(definitions)).toMatchObject({ all: 2, customEngine: 1, declarative: 1, bots: 2, tabs: 1, botOnly: 1 })
  expect(statisticsCounts(definitions, "ring0")).toMatchObject({ all: 1, customEngine: 0, declarative: 1, bots: 0 })
  expect(statisticsCounts(definitions, "missing").all).toBe(0)
})

test("property groups deduplicate array values and matching variants, including nested arrays, booleans and missing values", () => {
  const group = (path) => groupStatistics(definitions, new Map(), JSON.stringify(path))
  expect(group(["developerName"])).toEqual([{ label: "Contoso", count: 2 }, { label: "Microsoft", count: 1 }])
  expect(group(["categories"])).toEqual([
    { label: "Business", count: 1 }, { label: "Not specified", count: 1 }, { label: "Productivity", count: 1 },
  ])
  expect(group(["bots", "scopes"])).toEqual([
    { label: "Not specified", count: 1 }, { label: "personal", count: 1 }, { label: "team", count: 1 },
  ])
  expect(group(["isTeamsOwned"])).toEqual([
    { label: "No", count: 1 }, { label: "Not specified", count: 1 }, { label: "Yes", count: 1 },
  ])
  expect(groupStatistics(new Map(), new Map(), "$rings")).toEqual([])
})

test("entitlement grouping ignores states outside the matching variants", () => {
  const entitlements = new Map([["agent", new Map([
    ["general.user.personal", { state: "Installed" }], ["general.user.team", { state: "Installed" }],
    ["ring0.user.personal", { state: "Featured" }], ["missing.user.personal", { state: "HiddenFromAppStore" }],
  ])]])
  const scoped = new Map([["agent", new Map([["general", bot]])]])
  expect(groupStatistics(scoped, entitlements, "$entitlements")).toEqual([{ label: "Installed", count: 1 }])
})

test("background summaries keep query, capability and grouping evidence within the same matching variant", () => {
  const schema = buildAppDefinitionSchema(definitions)
  const input = {
    definitions, entitlements: new Map(), schema, audience: "all", type: "all",
    grouping: JSON.stringify(["developerName"]),
    query: { ...createGroup(), children: [createCondition("developerName", "Microsoft", schema)] },
  }
  expect(calculateStatistics(input)).toMatchObject({
    appCount: 1, variants: 1, developers: 1, entitledApps: 0,
    counts: { all: 1, customEngine: 0, declarative: 1, tabs: 1, bots: 0 },
    groups: [{ label: "Microsoft", count: 1 }],
  })
  expect(calculateStatistics({ ...input, type: "customEngine" })).toMatchObject({
    appCount: 0, variants: 0, developers: 0, groups: [],
  })
})

test("grouping selectors expose scalar leaves and primitive arrays without duplicates", () => {
  const properties = groupingProperties(buildAppDefinitionSchema(definitions))
  const values = properties.map(({ value }) => value)
  expect(new Set(values).size).toBe(values.length)
  expect(values).toContain(JSON.stringify(["bots", "scopes"]))
  expect(values).toContain(JSON.stringify(["categories"]))
  expect(values).not.toContain(JSON.stringify(["bots"]))
  expect(chartGroups(Array.from({ length: 10 }, (_, i) => ({ label: `Group ${i}`, count: 10 - i }))))
    .toHaveLength(7)
})

test("snapshots persist count history, deduplicate cached reloads, and skip partial catalogs", () => {
  const store = storage()
  const first = recordStatistics(catalogData(), store)
  expect(first).toHaveLength(1)
  expect(first[0].scopes.all).toMatchObject({ all: 2, customEngine: 1, declarative: 1 })
  expect(first[0].scopes.ring0).toMatchObject({ all: 1, customEngine: 0 })
  expect(recordStatistics(catalogData(), store)).toEqual(first)
  expect(recordStatistics(catalogData({ warning: "A source failed", capturedAt: new Date("2026-10-02") }), store)).toEqual(first)
  const next = recordStatistics(catalogData({ capturedAt: new Date("2026-10-03"), definitions: new Map() }), store)
  expect(next).toEqual(first)
  expect(recordStatistics(catalogData({ capturedAt: new Date("2026-10-04") }), store)).toHaveLength(2)
})

test("history is bounded and corrupt or inaccessible storage is never silently overwritten", () => {
  const store = storage()
  for (let day = 1; day <= 95; day++) {
    recordStatistics(catalogData({ capturedAt: new Date(Date.UTC(2026, 0, day)) }), store)
  }
  expect(JSON.parse(store.getItem(statisticsHistoryKey))).toHaveLength(90)
  const corrupt = storage('{"not":"history"}')
  expect(() => recordStatistics(catalogData(), corrupt)).toThrow("invalid")
  expect(corrupt.getItem(statisticsHistoryKey)).toBe('{"not":"history"}')
  expect(() => recordStatistics(catalogData(), { getItem() { throw new Error("Storage blocked") } })).toThrow("Storage blocked")
})

async function navigate(page, name) {
  const drawer = page.getByRole("button", { name: "Open navigation", exact: true })
  if (await drawer.isVisible()) await drawer.click()
  await page.getByRole("button", { name, exact: true }).filter({ visible: true }).click()
}

async function choose(page, name, value) {
  await page.getByRole("combobox", { name, exact: true }).click()
  await page.getByRole("option", { name: value, exact: true }).click()
}

async function fixture(page, { waitForCatalog = true, catalogReady, extraApps = [] } = {}) {
  let extra = false
  await page.route("https://config.edge.skype.com/**", (route) => {
    const ring = new URL(route.request().url()).searchParams.get("AudienceGroup")
    return route.fulfill({ json: { MicrosoftTeamsAppCatalog: { appCatalog: {
      storeAppDefinitions: { sources: [`https://catalog.test/${ring === "ring0" ? "preview" : "apps"}.json`] },
      preconfiguredAppEntitlements: { sources: ["https://catalog.test/entitlements.json"] },
    } } } })
  })
  await page.route("https://catalog.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/entitlements.json") return route.fulfill({ json: { value: { appEntitlements: {} } } })
    if (catalogReady) await catalogReady
    const apps = [
      path === "/preview.json" ? tab : bot,
      { id: "other", name: "Other", developerName: "Contoso", bots: [{ id: "other" }] },
      ...(extra ? [{ id: "new", name: "New CEA", developerName: "Microsoft", customEngineCopilots: [{ id: "new" }] }] : []),
      ...extraApps,
    ]
    return route.fulfill({ json: { value: { appDefinitions: apps } } })
  })
  await page.goto("/")
  if (waitForCatalog) await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await navigate(page, "Statistics")
  return { addApp: () => { extra = true } }
}

test("Statistics All includes the full dataset, capability tabs scope matching variants, and filters retain applied results", async ({ page }) => {
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await fixture(page)
  const results = page.getByRole("region", { name: "Statistics results" })
  await expect(results.getByRole("status")).toHaveText("2 matching apps")
  await expect(results.getByText("Baseline established", { exact: false })).toBeVisible()
  await expect(results.getByRole("group", { name: "Matching apps by capability", exact: true })).toBeVisible()
  await expect(results.getByRole("img", { name: /^Property distribution:/ })).toBeVisible()
  await page.getByRole("tab", { name: "Custom Engine Agents", exact: true }).click()
  await expect(results.getByRole("status")).toHaveText("1 matching apps")
  await expect(results.getByRole("table", { name: "Property group counts" })).not.toContainText("Microsoft")
  await page.getByRole("tab", { name: "Declarative Agents", exact: true }).click()
  await expect(results.getByRole("table", { name: "Property group counts" })).not.toContainText("Contoso")
  await page.getByRole("tab", { name: "All", exact: true }).click()
  await page.getByRole("button", { name: "Add condition", exact: true }).click()
  await choose(page, "Field 1", "developerName")
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("Microsoft")
  await expect(results.getByRole("status")).toHaveText("2 matching apps")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expect(results.getByRole("status")).toHaveText("1 matching apps")
  await expect(results.getByText("Historical growth is unavailable", { exact: false })).toBeVisible()
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("No match")
  await expect(page.getByRole("status", { name: "Query status" })).toContainText("Unapplied changes")
  await expect(results.getByRole("status")).toHaveText("1 matching apps")
  await navigate(page, "Advanced")
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveCount(0)
  await navigate(page, "Statistics")
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("No match")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expect(results.getByText("No matching apps.", { exact: false })).toBeVisible()
  expect(errors).toEqual([])
})

test("growth compares complete snapshots for All, CEA and DA and survives cached reloads", async ({ page }) => {
  const catalog = await fixture(page)
  catalog.addApp()
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  const growth = page.getByRole("table", { name: "Growth by capability", exact: true })
  await expect(growth.getByRole("row").filter({ hasText: "All apps" })).toContainText("+1 (+50%)")
  await expect(growth.getByRole("row").filter({ hasText: "Custom Engine Agents" })).toContainText("+1 (+100%)")
  await expect(growth.getByRole("row").filter({ hasText: "Declarative Agents" })).toContainText("0 (0%)")
  await expect(page.getByRole("img", { name: "Catalog growth over time" })).toBeVisible()
  await expect(page.getByRole("img", { name: "Catalog growth over time" }).locator("text")).toContainText(["0", "2", "4"])
  const history = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), statisticsHistoryKey)
  expect(history).toHaveLength(2)
  await page.getByRole("img", { name: "Catalog growth over time" }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: "test-results/statistics-desktop.png", fullPage: true })
  await page.reload()
  await navigate(page, "Statistics")
  await expect(growth).toBeVisible()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, statisticsHistoryKey)).toBe(2)
})

test("grouping supports boolean and array properties, ring filtering, and small screens without overflow", async ({ page }) => {
  await fixture(page)
  await choose(page, "Group by property", "isTeamsOwned")
  const groups = page.getByRole("table", { name: "Property group counts", exact: true })
  await expect(groups.getByRole("cell", { name: "Yes", exact: true })).toBeVisible()
  await expect(groups.getByRole("cell", { name: "No", exact: true })).toBeVisible()
  await choose(page, "Group by property", "categories")
  await expect(groups.getByRole("row").filter({ hasText: "Productivity" }).getByRole("cell").nth(1)).toHaveText("1")
  await navigate(page, "Settings")
  await page.getByRole("switch", { name: "Ring information", exact: true }).check()
  await navigate(page, "Statistics")
  await choose(page, "Filter by ring", "R0")
  await expect(page.getByRole("region", { name: "Statistics results" }).getByRole("status")).toHaveText("2 matching apps")
  await page.getByRole("tab", { name: "Custom Engine Agents", exact: true }).click()
  await expect(page.getByRole("region", { name: "Statistics results" }).getByRole("status")).toHaveText("0 matching apps")
  await page.getByRole("tab", { name: "All", exact: true }).click()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.getByRole("img", { name: /^Property distribution:/ }).scrollIntoViewIfNeeded()
  const legend = page.getByRole("img", { name: /^Property distribution:/ }).locator("..").getByRole("list")
  expect((await legend.boundingBox()).width).toBeGreaterThanOrEqual(160)
  await page.screenshot({ path: "test-results/statistics-mobile.png", fullPage: true })
  await navigate(page, "Library")
  await navigate(page, "Statistics")
  await expect(page.getByRole("tab", { name: "All", exact: true })).toHaveAttribute("aria-selected", "true")
})

test("corrupt history surfaces an error without hiding current statistics", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{"broken":true}'), statisticsHistoryKey)
  await fixture(page)
  await expect(page.getByRole("alert").filter({ hasText: "Cannot read or save statistics history" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Statistics results" }).getByRole("status")).toHaveText("2 matching apps")
})

test("growth does not compare incompatible source mappings or record partial refreshes", async ({ page }) => {
  await fixture(page)
  await page.evaluate((key) => {
    const history = JSON.parse(localStorage.getItem(key))
    history[0].sources = "different catalog configuration"
    localStorage.setItem(key, JSON.stringify(history))
  }, statisticsHistoryKey)
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await expect(page.getByRole("table", { name: "Growth by capability" })).toHaveCount(0)
  await expect(page.getByText("Baseline established", { exact: false })).toBeVisible()
  await page.route("https://catalog.test/preview.json", (route) => route.abort())
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
  await expect(page.getByText("Growth is paused", { exact: false })).toBeVisible()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, statisticsHistoryKey)).toBe(2)
})

test("Statistics navigation and shimmer paint while a worker is busy, and leaving cancels the calculation", async ({ page, context }) => {
  await context.route("**/statistics.worker*.js", async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `console.log("statistics-worker-test-start"); const until = performance.now() + 2000; while (performance.now() < until) {};\n${await response.text()}`,
    })
  })
  const workerStarted = page.waitForEvent("console", (message) => message.text() === "statistics-worker-test-start")
  const firstWorker = page.waitForEvent("worker")
  await fixture(page)
  await workerStarted
  const worker = await firstWorker
  const workerClosed = new Promise((resolve) => worker.once("close", resolve))
  await expect(page.getByRole("button", { name: "Statistics", exact: true })).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("region", { name: "Statistics loading" })).toHaveAttribute("aria-busy", "true")
  await expect(page.getByRole("status", { name: "Loading statistics", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Statistics results" })).toHaveCount(0)
  const animation = await page.locator(".statistics-shimmer").first().evaluate((element) =>
    getComputedStyle(element, "::after").animationName)
  expect(animation).toBe("statistics-shimmer")
  await page.screenshot({ path: "test-results/statistics-loading.png" })
  const navigationTime = await page.getByRole("button", { name: "Settings", exact: true }).evaluate(async (button) => {
    const start = performance.now()
    button.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return performance.now() - start
  })
  expect(navigationTime).toBeLessThan(1000)
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({ timeout: 1000 })
  await workerClosed
  await navigate(page, "Statistics")
  await page.getByRole("tab", { name: "Custom Engine Agents", exact: true }).click()
  await page.getByRole("tab", { name: "Declarative Agents", exact: true }).click()
  const results = page.getByRole("region", { name: "Statistics results" })
  await expect(results.getByRole("status")).toHaveText("1 matching apps")
  await expect(results.getByRole("table", { name: "Property group counts" })).toContainText("Microsoft")
  await expect(results.getByRole("table", { name: "Property group counts" })).not.toContainText("Contoso")
  await expect(page.getByRole("region", { name: "Statistics loading" })).toHaveCount(0)
})

test("Statistics opens during catalog loading and reduced motion disables shimmer animation", async ({ page }) => {
  let release
  const catalogReady = new Promise((resolve) => { release = resolve })
  await page.emulateMedia({ reducedMotion: "reduce" })
  try {
    await fixture(page, { waitForCatalog: false, catalogReady })
    await expect(page.getByRole("status", { name: "Loading statistics", exact: true })).toBeVisible()
    expect(await page.locator(".statistics-shimmer").first().evaluate((element) =>
      getComputedStyle(element, "::after").animationName)).toBe("none")
    await navigate(page, "Settings")
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    await navigate(page, "Statistics")
    await expect(page.getByRole("status", { name: "Loading statistics", exact: true })).toBeVisible()
  } finally {
    release()
  }
  await expect(page.getByRole("region", { name: "Statistics results" }).getByRole("status")).toHaveText("2 matching apps")
})

test("worker failures stop loading, show an actionable error, and retry successfully", async ({ page, context }) => {
  let fail = true
  await context.route("**/statistics.worker*.js", (route) => fail ? route.abort() : route.continue())
  await fixture(page)
  await expect(page.getByRole("alert").filter({ hasText: "Cannot load statistics" })).toBeVisible()
  await expect(page.getByRole("status", { name: "Loading statistics", exact: true })).toHaveCount(0)
  fail = false
  await page.getByRole("button", { name: "Retry statistics", exact: true }).click()
  await expect(page.getByRole("region", { name: "Statistics results" }).getByRole("status")).toHaveText("2 matching apps")
  await expect(page.getByRole("button", { name: "Retry statistics", exact: true })).toHaveCount(0)
})

test("large property group tables limit rendered rows without dropping groups", async ({ page }) => {
  await fixture(page, {
    extraApps: Array.from({ length: 205 }, (_, index) => ({
      id: `extra-${index}`, name: `Extra ${index}`, developerName: `Developer ${index}`,
    })),
  })
  const results = page.getByRole("region", { name: "Statistics results" })
  await expect(results.getByRole("status")).toHaveText("207 matching apps")
  await choose(page, "Group by property", "id")
  const table = page.getByRole("table", { name: "Property group counts" })
  await expect(table.getByRole("row")).toHaveCount(101)
  await expect(page.getByText("Groups 1-100 of 207", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Next property groups", exact: true }).click()
  await expect(page.getByText("Groups 101-200 of 207", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Next property groups", exact: true }).click()
  await expect(table.getByRole("row")).toHaveCount(8)
  await expect(page.getByText("Groups 201-207 of 207", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Next property groups", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Previous property groups", exact: true }).click()
  await expect(table.getByRole("row")).toHaveCount(101)
})
