import { expect, test } from "@playwright/test"

const apps = Array.from({ length: 32 }, (_, index) => ({
  id: `app-${String(index).padStart(2, "0")}`,
  name: index === 0 ? "Calendar" : `Catalog app ${String(index).padStart(2, "0")}`,
  version: "1.2.3",
  developerName: index === 0 ? "Example Developer" : "Example",
  description: `Description for app ${index}.`,
  officeAssetId: `asset-${index}`,
  manifestVersion: "1.19",
  isCoreApp: index === 0,
  categories: ["Productivity"],
  bots: [{ botId: "example-bot", scopes: ["personal"] }],
  ...(index === 0 ? { customEngineCopilots: [{ id: "example-engine" }] } : {}),
  ...(index === 1 ? { copilotGpts: [{ id: "example-declarative", fileUrl: "https://example.test/agent.json" }] } : {}),
  ...(index === 2 ? { staticTabs: [{ entityId: "example-tab" }] } : {}),
  ...(index === 3 ? { inputExtensions: [{ botId: "example-extension" }] } : {}),
}))

async function mockCatalog(page, options = {}) {
  const catalogApps = options.apps || apps
  await page.route("https://config.edge.skype.com/**", async (route) => {
    if (options.configFailure) return route.fulfill({ status: 503, body: "Unavailable" })
    const ring = new URL(route.request().url()).searchParams.get("AudienceGroup")
    if (options.partialConfig && ring === "ring3") return route.fulfill({ status: 503, body: "Unavailable" })
    return route.fulfill({ json: { MicrosoftTeamsAppCatalog: { appCatalog: {
      storeAppDefinitions: { sources: [`https://catalog.test/${ring === "ring0" ? "ring0" : "apps"}.json`] },
      preconfiguredAppEntitlements: { sources: ["https://catalog.test/entitlements.json"] },
    } } } })
  })
  await page.route("https://catalog.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (options.sourceFailure && path === "/ring0.json") return route.fulfill({ status: 503, body: "Unavailable" })
    if (path === "/entitlements.json") {
      return route.fulfill({ json: { value: { appEntitlements: { user: { personal: [
        { id: "app-00", state: "Installed" },
        { id: "app-01", state: "Featured" },
      ] } } } } })
    }
    const definitions = options.empty ? [] : path === "/ring0.json"
      ? [...catalogApps.map((app) => ({ ...app, version: "2.0.0" })), {
          id: "ring-only", name: "Preview app", version: "0.1.0", developerName: "Example",
          customEngineCopilots: [{ id: "preview-engine" }],
        }]
      : catalogApps
    return route.fulfill({ json: { value: { appDefinitions: definitions } } })
  })
}

async function loaded(page) {
  await page.goto("/")
  await expect(page.getByRole("table", { name: "App library" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^(Refresh|Retry)$/ })).toBeEnabled()
}

async function navigate(page, name) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click()
}

async function expectAdvanced(page) {
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Advanced", exact: true }))
    .toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("region", { name: "Query editor", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Selected preset query", exact: true })).toHaveCount(0)
  await expect(page.getByText("Starting point", { exact: true })).toHaveCount(0)
}

async function settings(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
}

async function expectAppResults(page, names) {
  const table = page.getByRole("table", { name: "App library", exact: true })
  await expect(table).toBeVisible()
  await expect(table.getByRole("row")).toHaveCount(names.length + 1)
  await expect(table.locator("tbody tr > td:first-child button")).toHaveText(names)
}

async function expectGridResults(page, expectedApps) {
  const grid = page.getByRole("region", { name: "App grid", exact: true })
  await expect(grid).toBeVisible()
  await expect(grid.getByRole("button")).toHaveCount(expectedApps.length)
  for (const app of expectedApps) {
    await expect(grid.getByRole("button", {
      name: `${app.name} by ${app.developerName}`, exact: true,
    })).toHaveCount(1)
  }
  await expect(page.getByRole("table", { name: "App library", exact: true })).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await mockCatalog(page)
})

test("Library summary keeps counts, sync time, and Refresh in one compact row", async ({ page }) => {
  await loaded(page)
  const summary = page.getByTestId("library-summary")
  const status = summary.getByRole("status", { name: "Catalog data source", exact: true })
  const refresh = summary.getByRole("button", { name: "Refresh", exact: true })
  const capturedAt = await status.locator("time").getAttribute("datetime")
  const formattedTime = await page.evaluate((value) => new Date(value).toLocaleString(), capturedAt)
  await expect(status).toHaveText(`Showing 33 of 33 apps, synced on ${formattedTime}`)
  await expect(page.getByText("Find an app. Inspect its definition.", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(status).toHaveText(`Showing 33 of 33 apps, synced on ${formattedTime}`)
  const search = page.getByRole("textbox", { name: "Search apps", exact: true })
  await search.fill("Calendar")
  await expect(status).toHaveText(`Showing 1 of 33 apps, synced on ${formattedTime}`)
  await search.fill("no-such-app")
  await expect(status).toHaveText(`Showing 0 of 33 apps, synced on ${formattedTime}`)
  await search.clear()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(refresh).toBeVisible()
    const textBounds = await status.boundingBox()
    const buttonBounds = await refresh.boundingBox()
    expect(textBounds.x + textBounds.width).toBeLessThanOrEqual(buttonBounds.x)
    expect(Math.abs(textBounds.y + textBounds.height / 2 - buttonBounds.y - buttonBounds.height / 2)).toBeLessThan(1)
    expect(await status.evaluate((element) => element.clientHeight))
      .toBe(await status.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight)))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test("query tiles preview five unique matching apps and open details directly without applying Library search", async ({ page }) => {
  await loaded(page)
  const search = page.getByRole("textbox", { name: "Search apps", exact: true })
  await search.fill("no-such-app")
  const tile = page.getByRole("article", { name: "Bots 32 apps", exact: true })
  const previews = tile.getByRole("list", { name: "Bots app previews", exact: true })
  await expect(previews.getByRole("button")).toHaveCount(5)
  await expect(previews.getByRole("button")).toHaveText(apps.slice(0, 5).map(({ name }) => `${name.charAt(0)}${name}`))
  await expect(tile.getByRole("button", { name: "Bots 32 apps", exact: true })).toHaveText("View all32 apps")
  const preview = previews.getByRole("button", { name: "Open Calendar details", exact: true })
  await expect(preview).toHaveAttribute("aria-haspopup", "dialog")
  await expect(preview).toHaveAttribute("title", "Calendar by Example Developer")
  for (const key of ["Enter", "Space"]) {
    await preview.focus()
    await page.keyboard.press(key)
    const dialog = page.getByRole("dialog", { name: "Calendar", exact: true })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }))
      .toHaveAttribute("aria-current", "page")
    await expect(preview).toBeFocused()
    await expect(search).toHaveValue("no-such-app")
  }
  await tile.getByRole("button", { name: "Bots 32 apps", exact: true }).click()
  await expectAppResults(page, apps.slice(0, 25).map(({ name }) => name))
  await expectAdvanced(page)
})

test("mobile tiles retain four accessible clickable app icons inside square cards", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await loaded(page)
  const tile = page.getByRole("article", { name: "Bots 32 apps", exact: true })
  const previews = tile.getByRole("list", { name: "Bots app previews", exact: true })
  await expect(previews.getByRole("button")).toHaveCount(4)
  const preview = previews.getByRole("button", { name: "Open Calendar details", exact: true })
  await preview.click()
  await expect(page.getByRole("dialog", { name: "Calendar", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(preview).toBeFocused()
  const bounds = await tile.boundingBox()
  expect(bounds.width).toBeCloseTo(bounds.height, 0)
  expect(await tile.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
  expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: "test-results/app-preview-tiles-mobile.png", animations: "disabled" })
})

test("app preview details honor the selected ring and failed icons retain an accessible fallback", async ({ page }) => {
  await mockCatalog(page, { apps: apps.map((app) => ({
    ...app, smallImageUrl: "https://images.test/unavailable.png",
  })) })
  await page.route("https://images.test/**", (route) => route.fulfill({ status: 404, body: "Unavailable" }))
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Library")
  await page.getByRole("combobox", { name: "Filter by ring", exact: true }).click()
  await page.getByRole("option", { name: "R0", exact: true }).click()
  const tile = page.getByRole("article", { name: "Bots 32 apps", exact: true })
  const preview = tile.getByRole("button", { name: "Open Calendar details", exact: true })
  await expect(preview.locator("img")).toHaveCount(0)
  await expect(preview).toContainText("C")
  await preview.click()
  const dialog = page.getByRole("dialog", { name: "Calendar", exact: true })
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App versions", exact: true }).getByRole("row")).toHaveCount(2)
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  await expect(dialog.locator("pre")).toContainText('"version": "2.0.0"')
  await expect(dialog.locator("pre")).toContainText('"audienceGroup": "ring0"')
  await page.keyboard.press("Escape")
  await expect(preview).toBeFocused()
})

test("six query tiles show unique app counts and open Advanced directly with editable conditions", async ({ page }) => {
  await loaded(page)
  const queries = page.getByRole("region", { name: "Preset queries", exact: true })
  await expect(queries.locator("[data-query-tile]")).toHaveCount(6)
  await page.getByRole("textbox", { name: "Search apps" }).fill("Calendar")
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("1 matching apps")
  for (const [title, names] of [
    ["Custom Engine Agents", ["Calendar", "Preview app"]],
    ["Declarative Agents", [apps[1].name]],
    ["Bots", apps.map((app) => app.name)],
    ["Tabs", [apps[2].name]],
    ["Bot Only Apps", apps.slice(4).map((app) => app.name)],
    ["Message Extensions", [apps[3].name]],
  ]) {
    const count = names.length
    const tile = queries.getByRole("button", { name: `${title} ${count} ${count === 1 ? "app" : "apps"}`, exact: true })
    await expect(tile.locator("..").locator("svg")).toHaveCount(1)
    await expect(tile).toHaveAttribute("aria-describedby")
    await expect(tile).toHaveAccessibleDescription(/\S/)
    await tile.focus()
    await page.keyboard.press("Enter")
    await expectAdvanced(page)
    await expect(page.getByLabel("Applied query", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeEnabled()
    await expectAppResults(page, names.slice(0, 25))
    await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled()
    if (count > 25) {
      await expect(page.getByText(`1-25 of ${count} apps`, { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Next page", exact: true }).click()
      await expectAppResults(page, names.slice(25))
      await expect(page.getByText(`26-${count} of ${count} apps`, { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled()
      await page.getByRole("button", { name: "Previous page", exact: true }).click()
      await expectAppResults(page, names.slice(0, 25))
    }
    await navigate(page, "Library")
    await expect(page.getByRole("main")).toBeFocused()
    await expect(page.getByRole("textbox", { name: "Search apps" })).toHaveValue("Calendar")
  }
  await queries.getByRole("button", { name: "Custom Engine Agents 2 apps", exact: true }).focus()
  await page.keyboard.press("Space")
  await expectAdvanced(page)
  await expectAppResults(page, ["Calendar", "Preview app"])
})

test("Advanced pagination resets for each selection without changing Library search or pagination", async ({ page }) => {
  await loaded(page)
  await page.getByRole("textbox", { name: "Search apps", exact: true }).fill("Catalog")
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  const libraryPage = apps.slice(26).map((app) => app.name)
  await expectAppResults(page, libraryPage)
  const queries = page.getByRole("region", { name: "Preset queries", exact: true })
  await queries.getByRole("button", { name: "Bots 32 apps", exact: true }).click()
  await expectAppResults(page, apps.slice(0, 25).map((app) => app.name))
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expectAppResults(page, apps.slice(25).map((app) => app.name))
  await navigate(page, "Library")
  await expect(page.getByRole("textbox", { name: "Search apps", exact: true })).toHaveValue("Catalog")
  await expectAppResults(page, libraryPage)
  await queries.getByRole("button", { name: "Bots 32 apps", exact: true }).click()
  await expectAppResults(page, apps.slice(0, 25).map((app) => app.name))
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await navigate(page, "Library")
  await queries.getByRole("button", { name: "Tabs 1 app", exact: true }).click()
  await expectAppResults(page, [apps[2].name])
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled()
  await navigate(page, "Library")
  await expectAppResults(page, libraryPage)
})

test("Advanced results retain display settings and open app details", async ({ page }) => {
  await loaded(page)
  await settings(page)
  for (const setting of ["Ring information", "App descriptions", "App identifiers", "Entitlement summaries"]) {
    await page.getByRole("switch", { name: setting, exact: true }).click()
  }
  await navigate(page, "Library")
  await page.getByRole("region", { name: "Preset queries", exact: true })
    .getByRole("button", { name: "Custom Engine Agents 2 apps", exact: true }).click()
  await expectAppResults(page, ["Calendar", "Preview app"])
  const table = page.getByRole("table", { name: "App library", exact: true })
  await expect(table.getByRole("columnheader", { name: "Rings", exact: true })).toBeVisible()
  await expect(table.getByRole("columnheader", { name: "Entitlements", exact: true })).toHaveCount(0)
  await expect(table.getByText("Description for app 0.", { exact: true })).toBeVisible()
  await expect(table.getByText("App ID: app-00", { exact: true })).toBeVisible()
  const trigger = table.getByRole("button", { name: "Calendar", exact: true })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Calendar", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("tab", { name: "Definition", exact: true }).click()
  await expect(dialog.getByText("bots", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expectAppResults(page, ["Calendar", "Preview app"])
})

test("a loaded preset with no matching apps shows an empty result", async ({ page }) => {
  const withoutTabs = apps.map((app) => ({ ...app, staticTabs: [] }))
  await mockCatalog(page, { apps: withoutTabs })
  await loaded(page)
  const tile = page.getByRole("region", { name: "Preset queries", exact: true })
    .getByRole("button", { name: "Tabs 0 apps", exact: true })
  await expect(tile.locator("..")).toContainText("No matching apps")
  await expect(tile.locator("..").getByRole("list")).toHaveCount(0)
  await expect(tile).toBeEnabled()
  await tile.click()
  await expectAdvanced(page)
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("0 matching apps")
  await expect(page.getByRole("heading", { name: "No matching apps", exact: true })).toBeVisible()
  await expect(page.getByRole("table", { name: "App library", exact: true })).toHaveCount(0)
})

test("Library Grid and List views retain results and pagination and persist the selected view", async ({ page }) => {
  await loaded(page)
  const view = page.getByRole("group", { name: "App view", exact: true })
  const gridView = view.getByRole("button", { name: "Grid view", exact: true })
  const listView = view.getByRole("button", { name: "List view", exact: true })
  await expect(listView).toHaveAttribute("aria-pressed", "true")
  await expect(gridView).toHaveAttribute("aria-pressed", "false")
  const search = page.getByRole("textbox", { name: "Search apps", exact: true })
  await search.fill("Catalog")
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  const expectedApps = apps.slice(26)
  await expectAppResults(page, expectedApps.map((app) => app.name))
  await gridView.click()
  await expect(gridView).toHaveAttribute("aria-pressed", "true")
  await expect(listView).toHaveAttribute("aria-pressed", "false")
  await expectGridResults(page, expectedApps)
  await expect(search).toHaveValue("Catalog")
  await expect(page.getByText("26-31 of 31 apps", { exact: true })).toBeVisible()
  await page.getByRole("region", { name: "App grid", exact: true }).screenshot({
    path: "test-results/app-grid.png", animations: "disabled",
  })
  await listView.click()
  await expectAppResults(page, expectedApps.map((app) => app.name))
  await expect(page.getByText("26-31 of 31 apps", { exact: true })).toBeVisible()
  await expect(search).toHaveValue("Catalog")
  await gridView.click()
  await page.reload()
  await expectGridResults(page, apps.slice(0, 25))
  await expect(gridView).toHaveAttribute("aria-pressed", "true")
  await settings(page)
  await page.getByRole("button", { name: "Reset display settings", exact: true }).click()
  await navigate(page, "Library")
  await expect(listView).toHaveAttribute("aria-pressed", "true")
  await expectAppResults(page, apps.slice(0, 25).map((app) => app.name))
  await expect(page.getByRole("region", { name: "App grid", exact: true })).toHaveCount(0)
})

test("Advanced Grid view retains preset pagination and supports keyboard app details", async ({ page }) => {
  await loaded(page)
  await page.getByRole("textbox", { name: "Search apps", exact: true }).fill("Calendar")
  await page.getByRole("region", { name: "Preset queries", exact: true })
    .getByRole("button", { name: "Bots 32 apps", exact: true }).click()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  const view = page.getByRole("group", { name: "App view", exact: true })
  await view.getByRole("button", { name: "Grid view", exact: true }).click()
  await expectGridResults(page, apps.slice(25))
  await expectAdvanced(page)
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("32 matching apps")
  await expect(page.getByText("26-32 of 32 apps", { exact: true })).toBeVisible()
  await view.getByRole("button", { name: "List view", exact: true }).click()
  await expectAppResults(page, apps.slice(25).map((app) => app.name))
  await expect(page.getByText("26-32 of 32 apps", { exact: true })).toBeVisible()
  await view.getByRole("button", { name: "Grid view", exact: true }).click()
  await page.getByRole("button", { name: "Previous page", exact: true }).click()
  await expectGridResults(page, apps.slice(0, 25))
  const card = page.getByRole("region", { name: "App grid", exact: true })
    .getByRole("button", { name: "Calendar by Example Developer", exact: true })
  await expect(card).toHaveJSProperty("tagName", "BUTTON")
  for (const key of ["Enter", "Space"]) {
    await card.focus()
    await page.keyboard.press(key)
    const dialog = page.getByRole("dialog", { name: "Calendar", exact: true })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(card).toBeFocused()
  }
  await navigate(page, "Library")
  await expect(page.getByRole("textbox", { name: "Search apps", exact: true })).toHaveValue("Calendar")
  await expectGridResults(page, [apps[0]])
})

test("app cards use square responsive columns without horizontal overflow", async ({ page }) => {
  await loaded(page)
  await page.getByRole("group", { name: "App view", exact: true })
    .getByRole("button", { name: "Grid view", exact: true }).click()
  const grid = page.getByRole("region", { name: "App grid", exact: true })
  await expectGridResults(page, apps.slice(0, 25))
  await page.evaluate(async () => { await document.fonts.ready })
  for (const [width, columns] of [[1440, 3], [700, 2], [360, 1]]) {
    await page.setViewportSize({ width, height: 1000 })
    const geometry = await grid.evaluate((section) => ({
      cards: [...section.querySelectorAll("button")].map((card) => {
        const { left, right, top } = card.getBoundingClientRect()
        const style = getComputedStyle(card)
        return {
          left, right, top,
          radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
          overflow: card.scrollWidth - card.clientWidth,
        }
      }),
      overflow: [...document.querySelectorAll("html, body, main"), section]
        .map((element) => element.scrollWidth - element.clientWidth),
    }))
    expect(geometry.cards.filter((card) => Math.round(card.top) === Math.round(geometry.cards[0].top)))
      .toHaveLength(columns)
    for (const card of geometry.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0)
      expect(card.right).toBeLessThanOrEqual(width)
      expect(card.radii).toEqual(["0px", "0px", "0px", "0px"])
      expect(card.overflow).toBeLessThanOrEqual(1)
    }
    for (const overflow of geometry.overflow) expect(overflow).toBeLessThanOrEqual(1)
    const calendar = grid.getByRole("button", { name: "Calendar by Example Developer", exact: true })
    const [name, developer] = await Promise.all([
      calendar.getByText("Calendar", { exact: true }).boundingBox(),
      calendar.getByText("Example Developer", { exact: true }).boundingBox(),
    ])
    expect(name.y + name.height).toBeLessThanOrEqual(developer.y)
    expect(name.x).toBeCloseTo(developer.x, 0)
  }
})

for (const [theme, accent] of [
  ["Light", "oklch(0.841 0.238 128.85)"],
  ["Dark", "oklch(0.768 0.233 130.85)"],
]) {
  test(`query tiles use app preview card geometry and accent icons in ${theme}`, async ({ page }) => {
    await loaded(page)
    await page.getByRole("group", { name: "Appearance", exact: true })
      .getByRole("button", { name: theme, exact: true }).click()
    const queries = page.getByRole("region", { name: "Preset queries", exact: true })
    const tiles = queries.locator("[data-query-tile]")
    await expect(tiles).toHaveCount(6)
    await expect(tiles.first().locator("svg")).toHaveCSS("color", accent)
    await page.evaluate(async () => { await document.fonts.ready })

    for (const [layout, width, columns, rows] of [
      ["desktop", 1440, 3, 2],
      ["tablet", 700, 2, 2],
      ["mobile", 360, 2, 2],
    ]) {
      await page.setViewportSize({ width, height: 1000 })
      const tileCount = layout === "desktop" ? 6 : 4
      await expect(tiles).toHaveCount(tileCount)
      await page.mouse.move(0, 0)
      const cardColor = await queries.evaluate((section) => {
        const probe = document.createElement("span")
        probe.style.backgroundColor = "var(--card)"
        section.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      })
      await expect.poll(() => tiles.evaluateAll((buttons) =>
        buttons.map((button) => getComputedStyle(button).backgroundColor)))
        .toEqual(Array(tileCount).fill(cardColor))
      const geometry = await tiles.evaluateAll((buttons) => {
        function bounds(element) {
          const { top, right, bottom, left, width, height } = element.getBoundingClientRect()
          return { top, right, bottom, left, width, height }
        }
        const grid = buttons[0].parentElement
        const gridStyles = getComputedStyle(grid)
        return {
          columnGap: parseFloat(gridStyles.columnGap),
          rowGap: parseFloat(gridStyles.rowGap),
          overflow: [...document.querySelectorAll("html, body, main"), grid]
            .map((element) => element.scrollWidth - element.clientWidth),
          tiles: buttons.map((button) => {
            const [titleId, countId] = button.getAttribute("aria-labelledby").split(/\s+/)
            const styles = getComputedStyle(button)
            const icon = button.querySelector("svg")
            const count = document.getElementById(countId)
            const countText = document.createRange()
            countText.selectNodeContents(count)
            return {
              card: bounds(button),
              icon: bounds(icon),
              title: bounds(document.getElementById(titleId)),
              description: bounds(document.getElementById(button.getAttribute("aria-describedby"))),
              count: bounds(count),
              countText: bounds(countText),
              previews: [...button.querySelectorAll('[aria-haspopup="dialog"]')].map(bounds),
              iconColor: getComputedStyle(icon).color,
              background: styles.backgroundColor,
              padding: [styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft],
              borders: [styles.borderTopWidth, styles.borderRightWidth, styles.borderBottomWidth, styles.borderLeftWidth],
              radii: [styles.borderTopLeftRadius, styles.borderTopRightRadius, styles.borderBottomRightRadius, styles.borderBottomLeftRadius],
              overflow: button.scrollWidth - button.clientWidth,
              verticalOverflow: button.scrollHeight - button.clientHeight,
            }
          }),
        }
      })

      expect(geometry.columnGap).toBe(16)
      expect(geometry.rowGap).toBe(16)
      if (layout === "desktop") {
        const section = await queries.boundingBox()
        expect(section.height).toBeCloseTo(528, 0)
        expect(section.height / 600).toBeGreaterThanOrEqual(0.87)
        expect(section.height / 600).toBeLessThanOrEqual(0.89)
      }
      const rowTops = [...new Set(geometry.tiles.map((tile) => Math.round(tile.card.top)))]
      expect(rowTops).toHaveLength(rows)
      for (const top of rowTops) {
        expect(geometry.tiles.filter((tile) => Math.round(tile.card.top) === top)).toHaveLength(columns)
      }
      for (const overflow of geometry.overflow) expect(overflow).toBeLessThanOrEqual(1)
      for (const [index, tile] of geometry.tiles.entries()) {
        expect(tile.iconColor).toBe(accent)
        expect(tile.background).toBe(cardColor)
        const horizontalPadding = layout === "desktop" ? 20 : 12
        expect(tile.padding).toEqual(["12px", `${horizontalPadding}px`, "12px", `${horizontalPadding}px`])
        if (layout === "desktop") expect(tile.card.width).toBeGreaterThan(tile.card.height)
        else expect(tile.card.width).toBeCloseTo(tile.card.height, 0)
        expect(tile.borders).toEqual(["1px", "1px", "1px", "1px"])
        expect(tile.radii).toEqual(["0px", "0px", "0px", "0px"])
        expect(tile.overflow).toBeLessThanOrEqual(1)
        expect(tile.verticalOverflow).toBeLessThanOrEqual(1)
        expect(tile.card.left).toBeGreaterThanOrEqual(0)
        expect(tile.card.right).toBeLessThanOrEqual(width)
        expect(tile.icon.left - tile.card.left).toBeCloseTo(horizontalPadding + 1, 0)
        expect(tile.icon.top - tile.card.top).toBeCloseTo(13, 0)
        expect(tile.title.left - tile.icon.right).toBeCloseTo(8, 0)
        expect(tile.title.top).toBeCloseTo(tile.icon.top, 0)
        expect(tile.previews.length).toBeGreaterThan(0)
        expect(tile.previews.length).toBeLessThanOrEqual(layout === "desktop" ? 5 : 4)
        for (const preview of tile.previews) {
          expect(preview.width).toBeGreaterThanOrEqual(24)
          expect(preview.height).toBeGreaterThanOrEqual(24)
          if (layout === "desktop") expect(preview.height).toBe(24)
          expect(preview.top).toBeGreaterThan(tile.title.bottom)
          expect(preview.bottom).toBeLessThanOrEqual(tile.count.top)
          expect(preview.left).toBeGreaterThanOrEqual(tile.card.left + horizontalPadding)
          expect(preview.right).toBeLessThanOrEqual(tile.card.right - horizontalPadding)
        }
        expect(tile.card.right - tile.count.right).toBeCloseTo(horizontalPadding + 1, 0)
        expect(tile.card.bottom - tile.count.bottom).toBeCloseTo(13, 0)
        expect(tile.countText.right).toBeCloseTo(tile.count.right, 0)
        for (const content of [tile.icon, tile.title, tile.count]) {
          expect(content.width).toBeGreaterThan(0)
          expect(content.height).toBeGreaterThan(0)
          expect(content.right).toBeLessThanOrEqual(tile.card.right - horizontalPadding)
        }
        const rowStart = geometry.tiles[Math.floor(index / columns) * columns]
        expect(tile.card.top).toBeCloseTo(rowStart.card.top, 0)
        expect(tile.card.height).toBeCloseTo(rowStart.card.height, 0)
        expect(tile.count.bottom).toBeCloseTo(rowStart.count.bottom, 0)
        if (index % columns !== 0) {
          const previous = geometry.tiles[index - 1]
          expect(tile.card.left - previous.card.right).toBeCloseTo(16, 0)
          expect(tile.card.width).toBeCloseTo(previous.card.width, 0)
        }
        if (index >= columns) {
          const above = geometry.tiles[index - columns]
          expect(tile.card.top - above.card.bottom).toBeCloseTo(16, 0)
          expect(tile.card.left).toBeCloseTo(above.card.left, 0)
        }
      }
      await queries.screenshot({
        path: `test-results/query-tiles-${theme.toLowerCase()}-${layout}.png`,
        animations: "disabled",
      })
    }
  })
}

test("statistics stay compact and preset counts respect the visible ring filter", async ({ page }) => {
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await page.getByRole("switch", { name: "Catalog statistics", exact: true }).click()
  await navigate(page, "Library")
  const statistics = page.getByLabel("Catalog statistics", { exact: true })
  await expect(statistics).toBeVisible()
  expect((await statistics.boundingBox()).height).toBeLessThanOrEqual(48)
  await expect(statistics.getByText("33", { exact: true })).toBeVisible()
  await page.screenshot({ path: "test-results/compact-dashboard.png", animations: "disabled" })
  await page.getByRole("combobox", { name: "Filter by ring" }).click()
  await page.getByRole("option", { name: "R4", exact: true }).click()
  await expect(page.getByRole("region", { name: "Preset queries" }).getByRole("button", { name: "Custom Engine Agents 1 app", exact: true })).toBeVisible()
  await page.getByRole("region", { name: "Preset queries" }).getByRole("button", { name: "Custom Engine Agents 1 app", exact: true }).click()
  await expectAdvanced(page)
  await expect(page.getByRole("combobox", { name: "Filter by ring", exact: true })
    .locator('[data-slot="select-value"]')).toHaveText("R4")
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("1 matching apps")
  await expectAppResults(page, ["Calendar"])
  await expect(page.getByRole("navigation").getByRole("button", { name: "Advanced", exact: true })).toHaveAttribute("aria-current", "page")
  await page.screenshot({ path: "test-results/advanced-preset.png", animations: "disabled" })
  await navigate(page, "Library")
  await page.setViewportSize({ width: 360, height: 780 })
  expect((await statistics.boundingBox()).height).toBeLessThanOrEqual(100)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test("query tiles stay unavailable when no catalog loaded", async ({ page }) => {
  await mockCatalog(page, { configFailure: true })
  await page.goto("/")
  await expect(page.getByRole("alert")).toContainText("Cannot load the catalog")
  const tiles = page.getByRole("region", { name: "Preset queries" }).locator("[data-query-tile]")
  await expect(tiles).toHaveCount(6)
  for (const tile of await tiles.all()) {
    await expect(tile.getByRole("button")).toBeDisabled()
    await expect(tile).toContainText("Not loaded")
  }
})

test("preset corners and component typography have no application overrides", async ({ page }) => {
  await loaded(page)
  async function expectSquareCorners() {
    const rounded = await page.evaluate(() => [...document.querySelectorAll("body *")]
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => {
        const styles = getComputedStyle(element)
        return [styles.borderTopLeftRadius, styles.borderTopRightRadius, styles.borderBottomLeftRadius, styles.borderBottomRightRadius]
          .some((radius) => parseFloat(radius) > 0)
      })
      .map((element) => `${element.tagName}: ${element.getAttribute("class") || ""}`))
    expect(rounded).toEqual([])
  }
  await expectSquareCorners()
  const sidebarButton = page.getByRole("navigation").getByRole("button", { name: "Library", exact: true })
  await expect(sidebarButton).toHaveCSS("text-transform", "uppercase")
  await expect(sidebarButton).toHaveCSS("font-size", "12px")
  await expect(sidebarButton).toHaveCSS("font-weight", "600")
  await settings(page)
  await expectSquareCorners()
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Library")
  await page.getByRole("combobox", { name: "Filter by ring" }).click()
  await expect(page.getByRole("option", { name: "All rings", exact: true })).toBeVisible()
  await expectSquareCorners()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Calendar" })
  await expect(dialog).toBeVisible()
  await expectSquareCorners()
  for (const name of ["Definition", "JSON"]) {
    await dialog.getByRole("tab", { name, exact: true }).click()
    await expect(dialog.getByRole("tabpanel", { name, exact: true })).toBeVisible()
    await expectSquareCorners()
  }
})

test("lime controls use near-black text with at least 7 to 1 contrast in both themes", async ({ page }) => {
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Library")
  for (const theme of ["Light", "Dark"]) {
    await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: theme, exact: true }).click()
    const brand = page.locator("aside .bg-primary")
    await expect(brand).toHaveCSS("color", "oklch(0.21 0.006 285.885)")
    await page.getByRole("combobox", { name: "Filter by ring" }).click()
    const option = page.getByRole("option", { name: "All rings", exact: true })
    await option.focus()
    await expect(option).toHaveCSS("color", "oklch(0.21 0.006 285.885)")
    await expect(option).toHaveCSS("background-color", theme === "Light" ? "oklch(0.841 0.238 128.85)" : "oklch(0.768 0.233 130.85)")
    for (const element of [brand, option]) {
      const contrast = await element.evaluate((target) => {
        const context = document.createElement("canvas").getContext("2d")
        function luminance(color) {
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
            const channel = value / 255
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          })
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
        }
        const styles = getComputedStyle(target)
        const foreground = luminance(styles.color)
        const background = luminance(styles.backgroundColor)
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
      expect(contrast).toBeGreaterThanOrEqual(7)
    }
    await page.screenshot({ path: `test-results/preset-menu-${theme.toLowerCase()}.png`, animations: "disabled" })
    await page.keyboard.press("Escape")
  }
})

test("requested preset uses lime colors and bold menu accents in both themes", async ({ page }) => {
  await loaded(page)
  const theme = () => page.evaluate(() => {
    const probe = document.createElement("span")
    document.body.append(probe)
    probe.style.color = "var(--primary)"
    const primary = getComputedStyle(probe).color
    probe.style.color = "var(--accent)"
    const accent = getComputedStyle(probe).color
    probe.remove()
    return { primary, accent }
  })
  await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: "Light", exact: true }).click()
  await expect.poll(theme).toEqual({
    primary: "oklch(0.841 0.238 128.85)",
    accent: "oklch(0.841 0.238 128.85)",
  })
  await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: "Dark", exact: true }).click()
  await expect.poll(theme).toEqual({
    primary: "oklch(0.768 0.233 130.85)",
    accent: "oklch(0.768 0.233 130.85)",
  })
})

test("simple dashboard, sidebar order, Advanced workspace, and pagination", async ({ page }) => {
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await loaded(page)
  await expect(page.getByRole("columnheader", { name: "Rings", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Catalog statistics")).toHaveCount(0)
  await expect(page.getByRole("table", { name: "App library" }).getByRole("row")).toHaveCount(26)
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("33 matching apps")
  await expect(page.getByRole("navigation").getByRole("button").first()).toHaveText("Advanced")
  await page.screenshot({ path: "test-results/library-desktop.png" })
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByText("26-33 of 33 apps", { exact: true })).toBeVisible()
  await navigate(page, "Advanced")
  await expect(page.getByRole("heading", { name: "Advanced", exact: true })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Simple", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { name: "Build a query, find your apps", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeEnabled()
  await navigate(page, "Library")
  await expect(page.getByText("26-33 of 33 apps", { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test("search retains existing fields, wildcards, operators, and no-match behavior", async ({ page }) => {
  await loaded(page)
  const input = page.getByRole("textbox", { name: "Search apps" })
  for (const query of ["Calendar", "app-00", "Example Developer", "asset-0", "Cal* AND Example"]) {
    await input.fill(query)
    await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible()
  }
  await input.fill("Calendar OR Preview")
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("2 matching apps")
  await input.fill("nothing-matches-this")
  await expect(page.getByRole("heading", { name: "No matching apps" })).toBeVisible()
  await input.fill("[*")
  await expect(page.getByRole("alert")).toContainText("Cannot apply this query")
  await input.fill("Calendar")
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("display settings persist and hide ring filters without hidden constraints", async ({ page }) => {
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await page.getByRole("switch", { name: "Catalog statistics", exact: true }).click()
  await page.getByRole("switch", { name: "App descriptions", exact: true }).click()
  await page.getByRole("switch", { name: "App identifiers", exact: true }).click()
  await page.getByRole("switch", { name: "Entitlement summaries", exact: true }).click()
  await navigate(page, "Library")
  await expect(page.getByRole("columnheader", { name: "Rings", exact: true })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Entitlements", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Catalog statistics")).toBeVisible()
  await expect(page.getByText("Description for app 0.", { exact: true })).toBeVisible()
  await expect(page.getByText("App ID: app-00", { exact: true })).toBeVisible()
  const ringFilter = page.getByRole("combobox", { name: "Filter by ring" })
  await ringFilter.click()
  await page.getByRole("option", { name: "R4", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("32 matching apps")
  await settings(page)
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Library")
  await expect(page.getByRole("combobox", { name: "Filter by ring" })).toHaveCount(0)
  await expect(page.getByRole("status").filter({ hasText: "matching apps" })).toHaveText("33 matching apps")
  await page.reload()
  await expect(page.getByText("App ID: app-00", { exact: true })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Rings", exact: true })).toHaveCount(0)
  await expect(page.getByRole("columnheader", { name: "Entitlements", exact: true })).toHaveCount(0)
  await settings(page)
  await page.getByRole("button", { name: "Reset display settings" }).click()
  await expect(page.getByRole("switch", { name: "App identifiers", exact: true })).not.toBeChecked()
  await expect(page.getByRole("switch", { name: "Entitlement summaries", exact: true })).toBeChecked()
})

test("Light, Dark, and System appearance work and persist", async ({ page }) => {
  await loaded(page)
  const appearance = page.getByRole("group", { name: "Appearance", exact: true })
  await appearance.getByRole("button", { name: "Dark", exact: true }).click()
  await expect(page.locator("html")).toHaveClass("dark")
  await page.reload()
  await expect(page.locator("html")).toHaveClass("dark")
  await expect(page.getByRole("table", { name: "App library" })).toBeVisible()
  await expect(page.getByRole("navigation").getByRole("button", { name: "Advanced", exact: true }))
    .toHaveCSS("color", "oklch(0.987 0.002 197.1)")
  await appearance.getByRole("button", { name: "Light", exact: true }).click()
  await expect(page.locator("html")).not.toHaveClass("dark")
  await page.emulateMedia({ colorScheme: "dark" })
  await appearance.getByRole("button", { name: "System", exact: true }).click()
  await expect(page.locator("html")).toHaveClass("dark")
  await page.screenshot({ path: "test-results/library-dark.png" })
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator("html")).not.toHaveClass("dark")
})

test("app library rows open details from other cells and blank space and restore focus", async ({ page }) => {
  await loaded(page)
  const trigger = page.getByRole("button", { name: "Calendar", exact: true })
  const row = page.getByRole("table", { name: "App library" }).getByRole("row").filter({ has: trigger })
  const dialog = page.getByRole("dialog", { name: "Calendar" })

  for (const cell of [row.getByRole("cell").nth(1), row.getByRole("cell").nth(2)]) {
    await cell.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  }

  const appCell = row.getByRole("cell").first()
  const bounds = await appCell.boundingBox()
  await appCell.click({ position: { x: bounds.width - 8, y: bounds.height - 8 } })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test("app row name and arrow activate once with pointer and keyboard", async ({ page }) => {
  await loaded(page)
  const name = page.getByRole("button", { name: "Calendar", exact: true })
  const arrow = page.getByRole("button", { name: "Open Calendar", exact: true })
  const row = page.getByRole("table", { name: "App library" }).getByRole("row").filter({ has: name })
  const dialog = page.getByRole("dialog", { name: "Calendar" })
  await row.evaluate((element) => {
    element.dataset.bubbledClicks = "0"
    document.addEventListener("click", (event) => {
      if (element.contains(event.target)) {
        element.dataset.bubbledClicks = String(Number(element.dataset.bubbledClicks) + 1)
      }
    })
  })

  for (const trigger of [name, arrow]) {
    for (const activation of ["click", "Enter", "Space"]) {
      await trigger.focus()
      if (activation === "click") await trigger.click()
      else await page.keyboard.press(activation)
      await expect(dialog).toBeVisible()
      await expect(page.getByRole("dialog")).toHaveCount(1)
      await page.keyboard.press("Escape")
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await expect(row).toHaveAttribute("data-bubbled-clicks", "0")
    }
  }
})

test("selecting app row text does not open details", async ({ page }) => {
  await loaded(page)
  const developer = page.getByText("Example Developer", { exact: true })
  await developer.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe("Example Developer")
})

test("app details retain versions, entitlements, all properties, and JSON", async ({ page }) => {
  await loaded(page)
  const trigger = page.getByRole("button", { name: "Calendar", exact: true })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Calendar" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("App ID", { exact: true })).toBeVisible()
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App versions" }).getByRole("row")).toHaveCount(10)
  await expect(dialog.getByRole("columnheader", { name: "Ring", exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Entitlements", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App entitlements" })).toContainText("Installed")
  await expect(dialog.getByRole("columnheader", { name: "Ring", exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Definition", exact: true }).click()
  await expect(dialog.getByText("bots", { exact: true })).toBeVisible()
  await expect(dialog.getByText("audienceGroup", { exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Technical", exact: true }).click()
  await expect(dialog.getByRole("tabpanel", { name: "Technical", exact: true }).getByText("1.19", { exact: true })).toBeVisible()
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  await expect(dialog.getByRole("tabpanel", { name: "JSON", exact: true }).locator("pre")).toContainText('"audienceGroup"')
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.getByRole("textbox", { name: "Search apps" })).toHaveValue("")
})

test("ring settings apply to version and entitlement details", async ({ page }) => {
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Library")
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Calendar" })
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App versions" }).getByRole("columnheader", { name: "Ring", exact: true })).toBeVisible()
  await dialog.getByRole("tab", { name: "Entitlements", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App entitlements" }).getByRole("columnheader", { name: "Ring", exact: true })).toBeVisible()
  await dialog.getByRole("combobox", { name: "App variant" }).click()
  await page.getByRole("option", { name: "R0 · 2.0.0", exact: true }).click()
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  await expect(dialog.locator("pre")).toContainText('"version": "2.0.0"')
})

test("entitlement state navigation opens the matching app details", async ({ page }) => {
  await loaded(page)
  await navigate(page, "Entitlement states")
  await page.getByRole("button", { name: "Installed 1 apps" }).click()
  await expect(page.getByRole("dialog", { name: "Installed" })).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Calendar" }).click()
  await expect(page.getByRole("dialog", { name: "Calendar" })).toBeVisible()
})

test("mobile navigation, appearance, and dialogs remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await loaded(page)
  await page.getByRole("button", { name: "Open navigation" }).click()
  const navigation = page.getByRole("dialog", { name: "Navigation" })
  await expect(navigation.getByRole("group", { name: "Appearance", exact: true })).toBeVisible()
  await navigation.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(navigation).toBeHidden()
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  await page.screenshot({ path: "test-results/settings-mobile.png" })
  await page.getByRole("button", { name: "Open navigation" }).click()
  await navigation.getByRole("button", { name: "Library", exact: true }).click()
  await expect(navigation).toBeHidden()
  await page.getByRole("region", { name: "Preset queries" }).getByRole("button", { name: "Bots 32 apps", exact: true }).click()
  await expect(page.getByRole("region", { name: "Query editor", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Selected preset query", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Applied query", { exact: true })).toContainText("bots")
  await page.getByRole("button", { name: "Open navigation" }).click()
  await navigation.getByRole("button", { name: "Library", exact: true }).click()
  await expect(navigation).toBeHidden()
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Calendar" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "Calendar" })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole("main").evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: "test-results/library-mobile.png", animations: "disabled" })
})

test("loaded sources and the entitlement reference remain available", async ({ page }) => {
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "Catalog statistics", exact: true }).click()
  await navigate(page, "Library")
  await page.getByRole("button", { name: "Loaded sources", exact: true }).click()
  const sources = page.getByRole("dialog", { name: "Loaded sources" })
  await expect(sources.getByRole("link")).toHaveCount(3)
  await expect(sources).toContainText("3 successful catalog sources.")
  await page.keyboard.press("Escape")
  await expect(sources).toBeHidden()
  await navigate(page, "Entitlement states")
  await page.getByRole("button", { name: "State reference", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "State reference" })).toContainText("InstalledAndPermanent")
})

test("configuration failures show Retry and do not block Settings", async ({ page }) => {
  await mockCatalog(page, { configFailure: true })
  await page.goto("/")
  await expect(page.getByRole("alert")).toContainText("Cannot load the catalog")
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
  await settings(page)
  await navigate(page, "Library")
  await mockCatalog(page)
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByRole("table", { name: "App library" })).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("partial results show a warning and refresh failures keep loaded data", async ({ page }) => {
  await mockCatalog(page, { sourceFailure: true, partialConfig: true })
  await loaded(page)
  await expect(page.getByRole("alert")).toContainText("2 sources failed")
  await mockCatalog(page, { configFailure: true })
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Previously loaded data stays available")
  await expect(page.getByRole("table", { name: "App library" })).toBeVisible()
})

test("empty catalog does not report success", async ({ page }) => {
  await mockCatalog(page, { empty: true })
  await page.goto("/")
  await expect(page.getByRole("alert")).toContainText("returned no app definitions")
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
})

test("storage failures show an explicit notice but settings still apply", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError") }
  })
  await loaded(page)
  await settings(page)
  await page.getByRole("switch", { name: "App identifiers", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Cannot save settings")
  await navigate(page, "Library")
  await expect(page.getByText("App ID: app-00", { exact: true })).toBeVisible()
})

function countCatalogRequests(page) {
  const requests = []
  page.on("request", (request) => {
    if (/^https:\/\/(config\.edge\.skype\.com|catalog\.test)\//.test(request.url())) {
      requests.push(request.url())
    }
  })
  return requests
}

test("reloads use the persistent catalog without remote requests", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await loaded(page)
  expect(requests.length).toBeGreaterThan(0)
  const initialRequests = requests.length
  const source = page.getByRole("status", { name: "Catalog data source", exact: true })
  await expect(source).toHaveAttribute("title", "Live catalog")
  const captureTime = await source.locator("time").getAttribute("datetime")
  await mockCatalog(page, { configFailure: true })

  for (let reload = 0; reload < 2; reload++) {
    await page.reload()
    await expect(source).toHaveAttribute("title", "Local cache")
    await expect(source.locator("time")).toHaveAttribute("datetime", captureTime)
    await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
    await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible()
    expect(requests).toHaveLength(initialRequests)
  }
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Calendar" })
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App versions" }).getByRole("row")).toHaveCount(10)
  await dialog.getByRole("tab", { name: "Entitlements", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App entitlements" })).toContainText("Installed")
  await page.keyboard.press("Escape")
  await settings(page)
  await page.getByRole("switch", { name: "Catalog statistics", exact: true }).click()
  await navigate(page, "Library")
  await page.getByRole("button", { name: "Loaded sources", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Loaded sources" }).getByRole("link")).toHaveCount(3)
  expect(requests).toHaveLength(initialRequests)
})

test("manual refresh requests new data and replaces the persistent catalog", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await loaded(page)
  const initialRequests = requests.length
  await mockCatalog(page, {
    apps: apps.map((app) => app.id === "app-00" ? { ...app, name: "Updated Calendar" } : app),
  })
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Updated Calendar", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  expect(requests.length).toBeGreaterThan(initialRequests)
  const refreshedRequests = requests.length
  await page.reload()
  await expect(page.getByRole("status", { name: "Catalog data source", exact: true })).toHaveAttribute("title", "Local cache")
  await expect(page.getByRole("button", { name: "Updated Calendar", exact: true })).toBeVisible()
  expect(requests).toHaveLength(refreshedRequests)
})

test("failed and empty refreshes preserve the saved catalog for reload", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await loaded(page)
  for (const options of [{ configFailure: true }, { empty: true }]) {
    await mockCatalog(page, options)
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(page.getByRole("alert")).toContainText("Previously loaded data stays available")
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
    const afterFailure = requests.length
    await page.reload()
    await expect(page.getByRole("status", { name: "Catalog data source", exact: true })).toHaveAttribute("title", "Local cache")
    await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible()
    await expect(page.getByRole("alert")).toHaveCount(0)
    expect(requests).toHaveLength(afterFailure)
  }
})

test("partial catalog warnings survive reload without repeated requests", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await mockCatalog(page, { sourceFailure: true, partialConfig: true })
  await loaded(page)
  await expect(page.getByRole("alert")).toContainText("2 sources failed")
  const initialRequests = requests.length
  await page.reload()
  await expect(page.getByRole("status", { name: "Catalog data source", exact: true })).toHaveAttribute("title", "Local cache")
  await expect(page.getByRole("alert")).toContainText("2 sources failed")
  expect(requests).toHaveLength(initialRequests)
})

test("invalid saved data triggers a visible warning and a fresh load", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await loaded(page)
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("catalog-explorer", 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction("snapshots", "readwrite")
      transaction.objectStore("snapshots").put({ version: 999 }, "latest")
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
  }))
  const initialRequests = requests.length
  await mockCatalog(page, { configFailure: true })
  await page.reload()
  await expect(page.getByRole("alert").filter({ hasText: "Cannot read the local cache" })).toBeVisible()
  await expect(page.getByRole("alert").filter({ hasText: "Cannot load the catalog" })).toBeVisible()
  expect(requests.length).toBeGreaterThan(initialRequests)
  await mockCatalog(page)
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await expect(page.getByRole("alert")).toHaveCount(0)
  const repairedRequests = requests.length
  await page.reload()
  await expect(page.getByRole("status", { name: "Catalog data source", exact: true })).toHaveAttribute("title", "Local cache")
  expect(requests).toHaveLength(repairedRequests)
})

test("blocked browser storage reports that catalog reloads need the server", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException("Storage blocked", "SecurityError") }
  })
  await loaded(page)
  await expect(page.getByRole("alert")).toContainText("Cannot save the local cache")
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible()
  const initialRequests = requests.length
  await page.reload()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await expect(page.getByRole("alert")).toContainText("Cannot save the local cache")
  expect(requests.length).toBeGreaterThan(initialRequests)
})

test("cache write failures retain current data and the last saved snapshot", async ({ page }) => {
  const requests = countCatalogRequests(page)
  await loaded(page)
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === "readwrite") throw new DOMException("Storage full", "QuotaExceededError")
      return transaction.apply(this, args)
    }
  })
  await mockCatalog(page, {
    apps: apps.map((app) => app.id === "app-00" ? { ...app, name: "Unsaved Calendar" } : app),
  })
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Unsaved Calendar", exact: true })).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("Cannot save the local cache")
  const refreshedRequests = requests.length
  await page.reload()
  await expect(page.getByRole("status", { name: "Catalog data source", exact: true })).toHaveAttribute("title", "Local cache")
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible()
  expect(requests).toHaveLength(refreshedRequests)
})
