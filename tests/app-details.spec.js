import { expect, test } from "@playwright/test"

const app = {
  id: "clipboard-app-id",
  name: "Clipboard fixture",
  version: "1.2.3",
  developerName: "Fixture Developer",
  description: "A synthetic app for popup tests.",
  isTeamsOwned: true,
  isCoreApp: true,
  categories: ["Productivity"],
  manifestVersion: "1.19",
  bots: [{ botId: "fixture-bot", scopes: ["personal"] }],
}
const previewApp = { ...app, version: "2.0.0", isTeamsOwned: false }

async function openDetails(page) {
  await page.goto("/")
  await expect(page.getByRole("button", { name: /^(Refresh|Retry)$/ })).toBeEnabled()
  await page.getByRole("button", { name: app.name, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: app.name, exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function selectPreview(page, dialog) {
  await dialog.getByRole("combobox", { name: "App variant" }).click()
  await page.getByRole("option", { name: /2\.0\.0/ }).click()
}

async function muteProperties(page, keys) {
  await page.goto("/")
  await expect(page.getByRole("button", { name: /^(Refresh|Retry)$/ })).toBeEnabled()
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  const settings = page.getByRole("region", { name: "App detail properties", exact: true })
  for (const key of keys) {
    await settings.getByRole("textbox", { name: "Search app detail properties", exact: true }).fill(key)
    await settings.getByRole("checkbox", { name: `Mute ${key}`, exact: true }).check()
  }
  return settings
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.clipboardWrites = []
    window.clipboardMode = "success"
    window.pendingClipboardWrites = []
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(value) {
          window.clipboardWrites.push(value)
          if (window.clipboardMode === "reject") return Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
          if (window.clipboardMode === "pending") {
            return new Promise((resolve, reject) => window.pendingClipboardWrites.push({ resolve, reject }))
          }
          return Promise.resolve()
        },
      },
    })
  })
  await page.route("https://config.edge.skype.com/**", async (route) => {
    const ring = new URL(route.request().url()).searchParams.get("AudienceGroup") || "general"
    return route.fulfill({ json: { MicrosoftTeamsAppCatalog: { appCatalog: {
      storeAppDefinitions: { sources: [`https://catalog.test/${ring}.json`] },
      preconfiguredAppEntitlements: { sources: ["https://catalog.test/entitlements.json"] },
    } } } })
  })
  await page.route("https://catalog.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/entitlements.json") {
      return route.fulfill({ json: { value: { appEntitlements: { user: { personal: [
        { id: app.id, state: "Installed" },
      ] } } } } })
    }
    return route.fulfill({ json: { value: { appDefinitions: [path === "/ring0.json" ? previewApp : app] } } })
  })
})

test("Summary copies the exact app ID with a right-aligned icon and a preset Teams-owned badge", async ({ page }) => {
  const dialog = await openDetails(page)
  const summary = dialog.getByRole("tabpanel", { name: "Summary", exact: true })
  const copy = summary.getByRole("button", { name: "Copy app ID", exact: true })
  await expect(copy).toHaveText("")
  await expect(copy.locator("svg")).toHaveCount(1)
  const idRow = summary.locator("dl > div").filter({ has: page.getByText("App ID", { exact: true }) })
  const alignment = await idRow.evaluate((row) => {
    const valueBox = row.querySelector("dd span").getBoundingClientRect()
    const copyBox = row.querySelector("button").getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    return { valueRight: valueBox.right, copyLeft: copyBox.left, rightGap: Math.abs(copyBox.right - rowBox.right) }
  })
  expect(alignment.copyLeft).toBeGreaterThan(alignment.valueRight)
  expect(alignment.rightGap).toBeLessThan(2)

  const tag = summary.getByText("Teams owned", { exact: true })
  await expect(tag).toHaveAttribute("data-slot", "badge")
  const style = await tag.evaluate((element) => {
    const css = getComputedStyle(element)
    return { radius: css.borderRadius, background: css.backgroundColor, padding: parseFloat(css.paddingLeft) }
  })
  expect(style.radius).toBe("0px")
  expect(style.background).toBe("rgba(0, 0, 0, 0)")
  expect(style.padding).toBe(0)
  await copy.click()
  await expect(summary.getByRole("status")).toHaveText("app ID copied.")
  expect(await page.evaluate(() => window.clipboardWrites)).toEqual([app.id])
  await expect(summary.getByText(app.version, { exact: true })).toBeVisible()
  await expect(summary.getByText(app.developerName, { exact: true })).toBeVisible()
  await selectPreview(page, dialog)
  await expect(summary.getByText("Teams owned", { exact: true })).toHaveCount(0)
  await expect(summary.getByText(previewApp.version, { exact: true })).toBeVisible()
})

test("JSON copies the complete selected variant and resets feedback on variant changes", async ({ page }) => {
  const dialog = await openDetails(page)
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  const json = dialog.getByRole("tabpanel", { name: "JSON", exact: true })
  const original = JSON.stringify({ ...app, sourceType: "store", audienceGroup: "general" }, null, 2)
  await expect(json.locator("pre")).toHaveText(original)
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await expect(json.getByRole("status")).toHaveText("JSON copied.")
  expect(await page.evaluate(() => window.clipboardWrites)).toEqual([original])

  await selectPreview(page, dialog)
  const preview = JSON.stringify({ ...previewApp, sourceType: "store", audienceGroup: "ring0" }, null, 2)
  await expect(json.getByRole("status")).toBeEmpty()
  await expect(json.locator("pre")).toHaveText(preview)
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await expect(json.getByRole("status")).toHaveText("JSON copied.")
  expect(await page.evaluate(() => window.clipboardWrites)).toEqual([original, preview])

  await dialog.getByRole("tab", { name: "Definition", exact: true }).click()
  await expect(dialog.getByRole("tabpanel", { name: "Definition", exact: true }).getByText("audienceGroup", { exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  await expect(json.locator("pre")).toHaveText(preview)
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App versions" })).toContainText("2.0.0")
  await dialog.getByRole("tab", { name: "Entitlements", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App entitlements" })).toContainText("Installed")
  await dialog.getByRole("tab", { name: "Technical", exact: true }).click()
  await expect(dialog.getByRole("tabpanel", { name: "Technical", exact: true })).toContainText("1.19")
})

test("app detail property search filters names and groups without changing muted selections", async ({ page }) => {
  const settings = await muteProperties(page, [])
  const search = settings.getByRole("textbox", { name: "Search app detail properties", exact: true })
  const properties = settings.getByRole("checkbox")
  const total = await properties.count()
  expect(total).toBeGreaterThan(2)

  await search.fill("  DeVeLoPeRnAmE  ")
  await expect(properties).toHaveCount(1)
  await settings.getByRole("checkbox", { name: "Mute developerName", exact: true }).check()
  await expect(settings.getByRole("status")).toHaveText("1 property muted")

  await search.fill("  VERSION INFORMATION  ")
  await expect(settings.getByRole("group")).toHaveCount(1)
  await expect(settings.getByRole("group", { name: "Version Information", exact: true })).toBeVisible()
  await expect(properties).toHaveCount(3)
  await expect(settings.getByRole("checkbox", { name: "Mute audienceGroup", exact: true })).toBeVisible()
  await expect(settings.getByRole("checkbox", { name: "Mute sourceType", exact: true })).toBeVisible()
  await expect(settings.getByRole("checkbox", { name: "Mute version", exact: true })).toBeVisible()

  await search.fill("no-such-property")
  await expect(properties).toHaveCount(0)
  await expect(settings.getByRole("status").filter({ hasText: "No matching properties." })).toBeVisible()
  await settings.getByRole("button", { name: "Clear search", exact: true }).click()
  await expect(search).toBeFocused()
  await expect(search).toHaveValue("")
  await expect(properties).toHaveCount(total)
  await expect(settings.getByRole("checkbox", { name: "Mute developerName", exact: true })).toBeChecked()
  await expect(settings.getByRole("status")).toHaveText("1 property muted")

  await page.reload()
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(search).toHaveValue("")
  await expect(settings.getByRole("checkbox", { name: "Mute developerName", exact: true })).toBeChecked()
  await settings.getByRole("button", { name: "Restore all properties", exact: true }).click()
  await expect(settings.getByRole("status")).toHaveText("0 properties muted")
})

test("muted properties disappear from every detail view and copied JSON without changing the library", async ({ page }) => {
  const muted = ["id", "version", "developerName", "description", "isTeamsOwned", "manifestVersion", "sourceType", "bots", "audienceGroup"]
  const settings = await muteProperties(page, muted)
  await expect(settings.getByRole("status")).toHaveText("9 properties muted")
  await page.getByRole("switch", { name: "Ring information", exact: true }).check()
  const dialog = await openDetails(page)
  await expect(dialog.getByText(app.developerName, { exact: true })).toHaveCount(0)
  await expect(dialog.getByText(app.description, { exact: true })).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "Copy app ID", exact: true })).toHaveCount(0)
  await expect(dialog.getByText("Teams owned", { exact: true })).toHaveCount(0)
  await expect(dialog.getByText("Core app", { exact: true })).toBeVisible()
  await dialog.getByRole("combobox", { name: "App variant", exact: true }).click()
  await expect(page.getByRole("listbox")).toBeVisible()
  await expect(page.getByRole("option").first()).toBeVisible()
  expect((await page.getByRole("option").allTextContents()).every((label) => /^Variant \d+$/.test(label))).toBe(true)
  await page.getByRole("option").first().click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  const versions = dialog.getByRole("table", { name: "App versions", exact: true })
  await expect(versions.getByRole("columnheader")).toHaveText(["Variant"])
  await expect(dialog.getByText(app.version, { exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Entitlements", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App entitlements", exact: true }).getByRole("columnheader", { name: "Ring", exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Technical", exact: true }).click()
  await expect(dialog.getByText("Manifest version", { exact: true })).toHaveCount(0)
  await expect(dialog.getByText("Source type", { exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Definition", exact: true }).click()
  await expect(dialog.getByRole("region", { name: "Version Information", exact: true })).toHaveCount(0)
  await expect(dialog.getByRole("region", { name: "Developer Information", exact: true })).toHaveCount(0)
  await dialog.getByRole("textbox", { name: "Search definition", exact: true }).fill("fixture-bot")
  await expect(dialog.getByRole("status")).toHaveText("No matching properties.")
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  const json = dialog.getByRole("tabpanel", { name: "JSON", exact: true })
  const payload = JSON.parse(await json.locator("pre").textContent())
  for (const key of muted) expect(Object.hasOwn(payload, key)).toBe(false)
  expect(payload.name).toBe(app.name)
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await expect(json.getByRole("status")).toHaveText("JSON copied.")
  expect(JSON.parse((await page.evaluate(() => window.clipboardWrites)).at(-1))).toEqual(payload)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: app.name, exact: true })).toBeVisible()
  await expect(page.getByText(app.developerName, { exact: true }).first()).toBeVisible()
  await page.getByRole("button", { name: "Export results", exact: true }).click()
  const exportDialog = page.getByRole("dialog", { name: "Export results", exact: true })
  const downloaded = page.waitForEvent("download")
  await exportDialog.getByRole("button", { name: "Export JSON", exact: true }).click()
  const download = await downloaded
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  expect(exported.appCount).toBe(1)
  expect(exported.apps[0].variants.find(({ ring }) => ring === "general").definition)
    .toEqual({ ...app, sourceType: "store", audienceGroup: "general" })
  await expect(exportDialog).toBeHidden()
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("button", { name: "Reset display settings", exact: true }).click()
  await expect(settings.getByRole("status")).toHaveText("0 properties muted")
  const restored = await openDetails(page)
  await expect(restored.getByRole("button", { name: "Copy app ID", exact: true })).toBeVisible()
  await expect(restored.getByText("Teams owned", { exact: true })).toBeVisible()
  await expect(restored.getByText(app.developerName, { exact: true }).last()).toBeVisible()
})

test("a bottom link toggles muted values temporarily and resets for variants and reopened details", async ({ page }) => {
  await muteProperties(page, ["developerName", "bots", "isTeamsOwned"])
  const dialog = await openDetails(page)
  const show = dialog.getByRole("button", { name: "Show muted properties (3)", exact: true })
  const panel = dialog.getByRole("region", { name: "Muted properties", exact: true })
  const teamsOwned = panel.locator("dl > div").filter({ has: page.getByText("isTeamsOwned", { exact: true }) }).locator("dd")
  await expect(show).toHaveAttribute("aria-expanded", "false")
  await expect(panel).toBeHidden()
  await expect(dialog.getByText(app.developerName, { exact: true })).toHaveCount(0)

  await show.focus()
  await page.keyboard.press("Enter")
  const hide = dialog.getByRole("button", { name: "Hide muted properties (3)", exact: true })
  await expect(hide).toHaveAttribute("aria-expanded", "true")
  await expect(panel).toBeVisible()
  await expect(panel.getByText(app.developerName, { exact: true })).toBeVisible()
  await expect(panel.locator("pre")).toHaveText(JSON.stringify(app.bots, null, 2))
  await expect(teamsOwned).toHaveText("Yes")
  expect(await hide.evaluate((element) => {
    const tabs = element.closest('[role="dialog"]').querySelector('[data-slot="tabs"]')
    return Boolean(tabs.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
  })).toBe(true)

  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(hide).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  const json = dialog.getByRole("tabpanel", { name: "JSON", exact: true })
  const payload = JSON.parse(await json.locator("pre").textContent())
  for (const key of ["developerName", "bots", "isTeamsOwned"]) expect(Object.hasOwn(payload, key)).toBe(false)
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await expect(json.getByRole("status")).toHaveText("JSON copied.")
  expect(JSON.parse((await page.evaluate(() => window.clipboardWrites)).at(-1))).toEqual(payload)

  await hide.click()
  await expect(panel).toBeHidden()
  await expect(dialog.getByText(app.developerName, { exact: true })).toHaveCount(0)
  await show.click()
  await selectPreview(page, dialog)
  await expect(show).toHaveAttribute("aria-expanded", "false")
  await expect(panel).toBeHidden()
  await show.click()
  await expect(teamsOwned).toHaveText("No")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: app.name, exact: true }).click()
  await expect(show).toHaveAttribute("aria-expanded", "false")
  await expect(panel).toBeHidden()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-explorer.preferences.v1")).mutedProperties))
    .toEqual(expect.arrayContaining(["developerName", "bots", "isTeamsOwned"]))
})

for (const mutedProperties of [[], ["missingProperty"]]) {
  test(`no muted-property toggle appears without muted values: ${JSON.stringify(mutedProperties)}`, async ({ page }) => {
    await page.addInitScript((mutedProperties) => {
      localStorage.setItem("catalog-explorer.preferences.v1", JSON.stringify({ mutedProperties }))
    }, mutedProperties)
    const dialog = await openDetails(page)
    await expect(dialog.getByRole("button", { name: /(?:Show|Hide) muted properties/ })).toHaveCount(0)
  })
}

test("muted identity fields use a neutral title and fully muted Technical fields show an empty state", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("catalog-explorer.preferences.v1", JSON.stringify({
      mutedProperties: ["name", "id", "manifestVersion", "officeAssetId", "lastUpdatedAt", "developerUrl", "sourceType"],
    }))
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: /^(Refresh|Retry)$/ })).toBeEnabled()
  await page.getByRole("button", { name: app.name, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "App details", exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(app.name, { exact: true })).toHaveCount(0)
  await expect(dialog.getByText(app.id, { exact: true })).toHaveCount(0)
  await dialog.getByRole("tab", { name: "Technical", exact: true }).click()
  await expect(dialog.getByText("No fields to show.", { exact: true })).toBeVisible()
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  const payload = JSON.parse(await dialog.getByRole("tabpanel", { name: "JSON", exact: true }).locator("pre").textContent())
  expect(Object.hasOwn(payload, "name")).toBe(false)
  expect(Object.hasOwn(payload, "id")).toBe(false)
})

test("failed property preference writes report session-only muting and preserve the source", async ({ page }) => {
  const settings = await muteProperties(page, [])
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === "catalog-explorer.preferences.v1") throw new DOMException("Storage blocked", "SecurityError")
      return original.call(this, key, value)
    }
  })
  await settings.getByRole("textbox", { name: "Search app detail properties", exact: true }).fill("id")
  await settings.getByRole("checkbox", { name: "Mute id", exact: true }).check()
  await expect(page.getByRole("alert")).toContainText("Cannot save settings. Changes apply to this session only.")
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Library", exact: true }).click()
  await page.getByRole("button", { name: app.name, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: app.name, exact: true })
  await expect(dialog.getByRole("button", { name: "Copy app ID", exact: true })).toHaveCount(0)
  const restored = await openDetails(page)
  await expect(restored.getByRole("button", { name: "Copy app ID", exact: true })).toBeVisible()
})

for (const invalid of ["id", ["id", 5], ["id", "id"]]) {
  test(`invalid muted property preferences report defaults: ${JSON.stringify(invalid)}`, async ({ page }) => {
    await page.addInitScript((mutedProperties) => {
      localStorage.setItem("catalog-explorer.preferences.v1", JSON.stringify({ mutedProperties }))
    }, invalid)
    await page.goto("/")
    await expect(page.getByRole("button", { name: /^(Refresh|Retry)$/ })).toBeEnabled()
    await expect(page.getByRole("alert")).toContainText("Cannot read saved settings. Default settings apply.")
    await page.getByRole("button", { name: app.name, exact: true }).click()
    await expect(page.getByRole("dialog", { name: app.name, exact: true }).getByRole("button", { name: "Copy app ID", exact: true })).toBeVisible()
  })
}

for (const { tab, label, value } of [
  { tab: "Summary", label: "app ID", value: app.id },
  { tab: "JSON", label: "JSON" },
]) {
  test(`${tab} shows rejected writes and clears the error when retrying`, async ({ page }) => {
    const dialog = await openDetails(page)
    await dialog.getByRole("tab", { name: tab, exact: true }).click()
    const panel = dialog.getByRole("tabpanel", { name: tab, exact: true })
    const expectedValue = value || await panel.locator("pre").textContent()
    const copy = panel.getByRole("button", { name: `Copy ${label}`, exact: true })
    await page.evaluate(() => { window.clipboardMode = "reject" })
    await copy.click()
    await expect(panel.getByRole("status")).toHaveText(`Could not copy ${label}. Try again.`)
    await page.evaluate(() => { window.clipboardMode = "pending" })
    await copy.click()
    await expect(panel.getByRole("status")).toHaveText(`Copying ${label}…`)
    await page.evaluate(() => window.pendingClipboardWrites[0].resolve())
    await expect(panel.getByRole("status")).toHaveText(`${label} copied.`)
    expect(await page.evaluate(() => window.clipboardWrites)).toEqual([expectedValue, expectedValue])
  })

  test(`${tab} explicitly reports an unavailable clipboard API`, async ({ page }) => {
    const dialog = await openDetails(page)
    await dialog.getByRole("tab", { name: tab, exact: true }).click()
    const panel = dialog.getByRole("tabpanel", { name: tab, exact: true })
    for (const clipboard of [undefined, {}]) {
      await page.evaluate((nextClipboard) => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: nextClipboard })
      }, clipboard)
      await panel.getByRole("button", { name: `Copy ${label}`, exact: true }).click()
      await expect(panel.getByRole("status")).toHaveText(`Clipboard access is unavailable. Copy ${label} manually.`)
    }
    expect(await page.evaluate(() => window.clipboardWrites)).toEqual([])
  })
}

test("late clipboard results do not overwrite feedback for another variant, retry, or reopened popup", async ({ page }) => {
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  const dialog = await openDetails(page)
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  const json = dialog.getByRole("tabpanel", { name: "JSON", exact: true })
  await page.evaluate(() => { window.clipboardMode = "pending" })
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await expect(json.getByRole("status")).toHaveText("Copying JSON…")
  await selectPreview(page, dialog)
  await expect(json.getByRole("status")).toBeEmpty()
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await page.evaluate(() => window.pendingClipboardWrites[0].resolve())
  await expect(json.getByRole("status")).toHaveText("Copying JSON…")
  await page.evaluate(() => window.pendingClipboardWrites[1].resolve())
  await expect(json.getByRole("status")).toHaveText("JSON copied.")

  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await page.evaluate(() => window.pendingClipboardWrites[3].resolve())
  await expect(json.getByRole("status")).toHaveText("JSON copied.")
  await page.evaluate(() => window.pendingClipboardWrites[2].reject(new Error("Late failure")))
  await expect(json.getByRole("status")).toHaveText("JSON copied.")

  await json.getByRole("button", { name: "Copy JSON", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await page.getByRole("button", { name: app.name, exact: true }).click()
  await expect(dialog.getByRole("tabpanel", { name: "Summary", exact: true }).getByRole("status")).toBeEmpty()
  await page.evaluate(() => window.pendingClipboardWrites[4].reject(new Error("Closed popup")))
  await expect(dialog.getByRole("tabpanel", { name: "Summary", exact: true }).getByRole("status")).toBeEmpty()
  expect(errors).toEqual([])
})
