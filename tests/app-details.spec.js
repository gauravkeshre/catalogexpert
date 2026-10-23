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
