import { expect, test } from "@playwright/test"

const apps = [
  { id: "helper", name: "Helper", developerName: "Microsoft", bots: [{ id: "bot", supportsFiles: true, scopes: ["personal", "team"] }],
    webApplicationInfo: { id: "client-helper", resource: "api://helper" }, amsSellerAccountId: 12, isTeamsOwned: true },
  { id: "calendar", name: "Calendar", developerName: "Microsoft", staticTabs: [{ id: "tab", contentUrl: "https://{mySiteDomain}/_layouts/15/teamshostedapp.aspx" }],
    webApplicationInfo: { id: "client-calendar", resource: "api://calendar" }, amsSellerAccountId: 2, isTeamsOwned: true },
  { id: "other", name: "Other bot", developerName: "Contoso", bots: [
    { id: "bot", supportsFiles: false, scopes: ["personal"] }, { id: "other", supportsFiles: true, scopes: ["team"] },
  ], isTeamsOwned: false },
]

test.beforeEach(async ({ page }) => {
  await page.route("https://config.edge.skype.com/**", (route) => {
    const ring = new URL(route.request().url()).searchParams.get("AudienceGroup")
    return route.fulfill({ json: { MicrosoftTeamsAppCatalog: { appCatalog: {
      storeAppDefinitions: { sources: [`https://catalog.test/${ring === "ring0" ? "preview" : "apps"}.json`] },
      preconfiguredAppEntitlements: { sources: ["https://catalog.test/entitlements.json"] },
    } } } })
  })
  await page.route("https://catalog.test/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/entitlements.json") return route.fulfill({ json: { value: { appEntitlements: {} } } })
    const definitions = path === "/preview.json"
      ? apps.map((app) => app.id === "helper" ? { ...app, name: "Preview Helper", bots: [], staticTabs: [{ id: "preview-tab" }] } : app)
      : apps
    return route.fulfill({ json: { value: { appDefinitions: definitions } } })
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await navigate(page, "Advanced")
})

async function navigate(page, name) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click()
}

async function choose(page, label, value) {
  const fields = {
    "App name": "name", Developer: "developerName", Description: "description",
    Capability: "Capability (derived)", "Teams owned": "isTeamsOwned",
  }
  if (label.startsWith("Field ")) value = fields[value] || value
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: value, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

async function addCondition(page, field, value, path = "1", parent) {
  const scope = parent || page.getByRole("tabpanel")
  await scope.getByRole("button", { name: "Add condition", exact: true }).last().click()
  await choose(page, `Field ${path}`, field)
  if (typeof value === "string") await page.getByRole("textbox", { name: `Value ${path}`, exact: true })
    .or(page.getByRole("spinbutton", { name: `Value ${path}`, exact: true })).fill(value)
  else await choose(page, `Value ${path}`, value.choice)
}

async function expectResults(page, names) {
  const results = page.getByRole("region", { name: "Query results", exact: true })
  await expect(page.getByTestId("advanced-summary").getByRole("status"))
    .toContainText(`Showing ${names.length} of 3 apps, synced on `)
  await expect(results.getByRole("status").filter({ hasText: "matching apps" })).toHaveText(`${names.length} matching apps`)
  if (names.length) {
    await expect(results.locator("tbody tr > td:first-child button")).toHaveText(names)
  } else {
    await expect(results.getByRole("heading", { name: "No matching apps", exact: true })).toBeVisible()
  }
}

async function readExport(page, dialog) {
  const downloaded = page.waitForEvent("download")
  await dialog.getByRole("button", { name: "Export JSON", exact: true }).click()
  const download = await downloaded
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  await expect(dialog).toBeHidden()
  return { filename: download.suggestedFilename(), payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) }
}

async function selectExportFields(dialog, fields) {
  await dialog.getByRole("radio", { name: "Selected fields", exact: true }).check()
  for (const name of ["App Name", "App ID", "Developer"]) {
    await dialog.getByRole("checkbox", { name, exact: true }).setChecked(fields.includes(name))
  }
}

test("Advanced summary keeps the sync time and Refresh in one row before and after running a query", async ({ page }) => {
  const summary = page.getByTestId("advanced-summary")
  const status = summary.getByRole("status", { name: "Catalog data source", exact: true })
  const refresh = summary.getByRole("button", { name: "Refresh", exact: true })
  const capturedAt = await status.locator("time").getAttribute("datetime")
  const formattedTime = await page.evaluate((value) => new Date(value).toLocaleString(), capturedAt)
  await expect(status).toHaveText(`Showing 0 of 3 apps, synced on ${formattedTime}`)
  await expect(page.getByText("Your conditions. The apps that match.", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expect(status).toHaveText(`Showing 3 of 3 apps, synced on ${formattedTime}`)
  await addCondition(page, "Developer", "Microsoft")
  await expect(status).toHaveText(`Showing 3 of 3 apps, synced on ${formattedTime}`)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expect(status).toHaveText(`Showing 2 of 3 apps, synced on ${formattedTime}`)

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const textBounds = await status.boundingBox()
    const buttonBounds = await refresh.boundingBox()
    expect(textBounds.x + textBounds.width).toBeLessThanOrEqual(buttonBounds.x)
    expect(Math.abs(textBounds.y + textBounds.height / 2 - buttonBounds.y - buttonBounds.height / 2)).toBeLessThan(1)
    expect(await status.evaluate((element) => element.clientHeight))
      .toBe(await status.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight)))
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await refresh.click()
  await expect(refresh).toBeEnabled()
  await expectResults(page, ["Calendar", "Helper"])
  await page.reload()
  await navigate(page, "Advanced")
  await expect(status).toHaveAttribute("title", "Local cache")
  await expect(status).toContainText("Showing 0 of 3 apps, synced on ")
})

test("Simple runs AND conditions, keeps previous results until rerun, and retains drafts across navigation", async ({ page }) => {
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await expect(page.getByRole("heading", { name: "Build a query, find your apps", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper", "Other bot"])
  await addCondition(page, "Developer", "Microsoft")
  await expect(page.getByRole("status", { name: "Query status" })).toContainText("Unapplied changes")
  await expectResults(page, ["Calendar", "Helper", "Other bot"])
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await addCondition(page, "Capability", { choice: "Bots" }, "2")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await page.locator("main").evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: "test-results/advanced-simple-desktop.png" })
  await navigate(page, "Library")
  await page.getByRole("textbox", { name: "Search apps", exact: true }).fill("Other")
  await navigate(page, "Advanced")
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Microsoft")
  await expectResults(page, ["Helper"])
  await page.getByRole("region", { name: "Query results" }).getByRole("button", { name: "Helper", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Helper", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("combobox", { name: "App variant", exact: true }).click()
  const variantCount = await page.evaluate(() => window.utils.AUDIENCE_GROUPS.length - 1)
  await expect(page.getByRole("option")).toHaveCount(variantCount)
  await page.keyboard.press("Escape")
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  await expect(dialog.locator("pre")).toContainText('"name": "Helper"')
  await expect(dialog.locator("pre")).toContainText('"bots"')
  await page.keyboard.press("Escape")
  expect(errors).toEqual([])
})

test("Advanced composes nested OR under AND and mode switching never discards conditions", async ({ page }) => {
  await addCondition(page, "Developer", "Microsoft")
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  const panel = page.getByRole("tabpanel")
  await panel.getByRole("button", { name: "Add group", exact: true }).click()
  const nested = page.getByRole("group", { name: "Condition group 2", exact: true })
  await choose(page, "Match group 2", "Any (OR)")
  await choose(page, "Field 2.1", "Capability")
  await choose(page, "Value 2.1", "Bots")
  await addCondition(page, "Capability", { choice: "Tabs" }, "2.2", nested)
  await expect(page.getByLabel("Query preview", { exact: true }))
    .toHaveText('developerName contains "Microsoft" AND (Capability (derived) is "Bots" OR Capability (derived) is "Tabs")')
  for (const path of ["1", "2.1", "2.2"]) {
    const bounds = await page.getByRole("group", { name: `Condition ${path}`, exact: true }).boundingBox()
    expect(bounds.height).toBe(48)
  }
  const firstAlternative = await page.getByRole("group", { name: "Condition 2.1", exact: true }).boundingBox()
  const secondAlternative = await page.getByRole("group", { name: "Condition 2.2", exact: true }).boundingBox()
  expect(secondAlternative.y - firstAlternative.y).toBe(52)
  await expect(page.getByRole("tab", { name: "Simple", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await page.locator("main").evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: "test-results/advanced-composite-desktop.png" })
  await page.getByRole("button", { name: "Remove group 2", exact: true }).click()
  await page.getByRole("tab", { name: "Simple", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Microsoft")
  await expect(page.getByRole("status", { name: "Query status" })).toContainText("Unapplied changes")
})

test("reference-style connector sits beside the second rule and controls the whole group", async ({ page }) => {
  await addCondition(page, "App name", "Helper")
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  const connector = page.getByRole("combobox", { name: "Match query", exact: true })
  await expect(connector).toHaveCount(1)
  await expect(connector.locator('[data-slot="select-value"]')).toHaveText("AND")
  await addCondition(page, "App name", "Calendar", "2")
  const root = page.getByRole("group", { name: "Query conditions", exact: true })
  await expect(root.getByText("Where", { exact: true })).toHaveCount(1)
  const connectorBounds = await connector.boundingBox()
  const secondFieldBounds = await page.getByRole("combobox", { name: "Field 2", exact: true }).boundingBox()
  expect(Math.abs(connectorBounds.y - secondFieldBounds.y)).toBeLessThan(1)
  expect(connectorBounds.x + connectorBounds.width).toBeLessThan(secondFieldBounds.x)
  await choose(page, "Match query", "Any (OR)")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await choose(page, "Match query", "None (NOT)")
  await expect(root).toContainText("Exclude matches to any rule")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Other bot"])
  await addCondition(page, "Developer", "Contoso", "3")
  await expect(root.getByText("OR", { exact: true })).toHaveCount(1)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, [])
  await page.getByRole("button", { name: "Remove condition 3", exact: true }).click()
  await page.getByRole("button", { name: "Remove condition 2", exact: true }).click()
  await expect(connector).toHaveCount(1)
  await expect(connector.locator('[data-slot="select-value"]')).toHaveText("NOT")
  await choose(page, "Match query", "All (AND)")
  await page.getByRole("tab", { name: "Simple", exact: true }).click()
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
})

test("filter surfaces and controls keep the shadcn preset corners across modes and viewports", async ({ page }) => {
  const editor = page.getByRole("region", { name: "Query editor", exact: true })
  async function expectPresetCorners() {
    await expect(editor).toHaveCSS("border-radius", "0px")
    const surfaces = editor.locator(':scope, [role="group"], [data-slot="select-trigger"], [data-slot="input"], [data-slot="button"], .border-dashed, .border-t')
    const radii = await surfaces.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element)
      return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
    }))
    expect(radii.length).toBeGreaterThan(5)
    for (const corners of radii) expect(corners).toEqual(["0px", "0px", "0px", "0px"])
  }

  await expectPresetCorners()
  await addCondition(page, "Developer", "Microsoft")
  await expectPresetCorners()
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  await page.getByRole("button", { name: "Add group", exact: true }).click()
  await choose(page, "Field 2.1", "bots")
  await page.getByRole("spinbutton", { name: "Value 2.1", exact: true }).fill("1")
  await expect(page.getByRole("group", { name: "Array items 2.1", exact: true })).toBeVisible()

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectPresetCorners()
    await page.getByRole("combobox", { name: "Field 1", exact: true }).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toHaveCSS("border-radius", "0px")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
})

test("clearing a nested filter preserves sibling filters and applied results", async ({ page }) => {
  await addCondition(page, "Developer", "Microsoft")
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  await page.getByRole("button", { name: "Add group", exact: true }).click()
  const nested = page.getByRole("group", { name: "Condition group 2", exact: true })
  await choose(page, "Field 2.1", "Capability")
  await choose(page, "Value 2.1", "Bots")
  await choose(page, "Match group 2", "Any (OR)")
  await addCondition(page, "Capability", { choice: "Tabs" }, "2.2", nested)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await page.screenshot({ path: "test-results/filter-ux-experiment-desktop.png" })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: "test-results/filter-ux-experiment-mobile.png" })
  await page.getByRole("button", { name: "Clear group 2", exact: true }).click()
  await expect(nested.getByRole("group", { name: /^Condition \d/ })).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Microsoft")
  await expect(page.getByRole("alert")).toContainText("empty group")
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeDisabled()
  await expect(page.getByRole("status", { name: "Query status", exact: true })).toContainText("Unapplied changes")
  await expectResults(page, ["Calendar", "Helper"])
  await addCondition(page, "Capability", { choice: "Bots" }, "2.1", nested)
  await expect(page.getByRole("combobox", { name: "Match group 2", exact: true })
    .locator('[data-slot="select-value"]')).toHaveText("OR")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
})

test("top-level OR, validation, negative and empty operators, removal, and clearing are explicit", async ({ page }) => {
  await addCondition(page, "App name", "Helper")
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  await choose(page, "Match query", "Any (OR)")
  await addCondition(page, "App name", "Calendar", "2")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await page.getByRole("textbox", { name: "Value 2", exact: true }).clear()
  await expect(page.getByRole("alert")).toContainText("Enter a value for name")
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Remove condition 2", exact: true }).click()
  await choose(page, "Operator 1", "does not contain")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Other bot"])
  await choose(page, "Field 1", "Description")
  await choose(page, "Operator 1", "is empty")
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper", "Other bot"])
  await page.getByRole("button", { name: "Clear query", exact: true }).click()
  await expect(page.getByRole("tab", { name: "Simple", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByLabel("Query preview", { exact: true })).toHaveText("All apps")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expect(page.getByRole("status", { name: "Query status" })).toHaveText("Query applied")
})

test("empty groups cannot run and Prompt to query is a TODO with no generated results", async ({ page }) => {
  await addCondition(page, "Developer", "Microsoft")
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  await page.getByRole("button", { name: "Add group", exact: true }).click()
  await page.getByRole("button", { name: "Remove condition 2.1", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("empty group")
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Remove group 2", exact: true }).click()
  await page.getByRole("tab", { name: "Prompt to query TODO", exact: true }).click()
  await expect(page.getByRole("tabpanel")).toContainText("Prompt generation is not implemented.")
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Back to editor", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Microsoft")
})

test("presets seed editable conditions and remain independent of Library search", async ({ page }) => {
  await navigate(page, "Library")
  await page.getByRole("textbox", { name: "Search apps" }).fill("Calendar")
  await page.getByRole("region", { name: "Preset queries" }).getByRole("button", { name: "Bots 2 apps", exact: true }).click()
  await expect(page.getByRole("combobox", { name: "Field 1.1", exact: true }).locator('[data-slot="select-value"]')).toHaveText("bots")
  await expect(page.getByRole("spinbutton", { name: "Value 1.1", exact: true })).toHaveValue("0")
  await expectResults(page, ["Helper", "Other bot"])
  await addCondition(page, "Teams owned", { choice: "Yes" }, "2")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await navigate(page, "Library")
  await expect(page.getByRole("textbox", { name: "Search apps" })).toHaveValue("Calendar")
})

test("visible rings re-evaluate applied queries and hidden rings never constrain results", async ({ page }) => {
  await addCondition(page, "Developer", "Microsoft")
  await addCondition(page, "Capability", { choice: "Bots" }, "2")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Advanced")
  await choose(page, "Filter by ring", "R0")
  await expectResults(page, [])
  await expect(page.getByRole("status", { name: "Query status" })).toHaveText("Query applied")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Advanced")
  await expect(page.getByRole("combobox", { name: "Filter by ring", exact: true })).toHaveCount(0)
  await expectResults(page, ["Helper"])
})

for (const theme of ["Light", "Dark"]) {
  for (const width of [1440, 320]) {
    test(`filter controls follow the shadcn preset in ${theme} at ${width}px`, async ({ page }) => {
      await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: theme, exact: true }).click()
      await addCondition(page, "Developer", "Microsoft")
      await page.getByRole("tab", { name: "Advanced", exact: true }).click()
      await page.getByRole("button", { name: "Add group", exact: true }).click()
      await choose(page, "Field 2.1", "bots")
      await page.getByRole("spinbutton", { name: "Value 2.1", exact: true }).fill("1")
      await expect(page.getByRole("group", { name: "Array items 2.1", exact: true })).toBeVisible()
      await page.setViewportSize({ width, height: 1000 })
      const editor = page.getByRole("region", { name: "Query editor", exact: true })

      async function expectSquareCorners() {
        const rounded = await page.evaluate(() => [...document.querySelectorAll("body *")]
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => {
            const styles = getComputedStyle(element)
            return [styles.borderTopLeftRadius, styles.borderTopRightRadius, styles.borderBottomRightRadius, styles.borderBottomLeftRadius]
              .some((radius) => parseFloat(radius) > 0)
          })
          .map((element) => `${element.tagName}: ${element.getAttribute("class") || ""}`))
        expect(rounded).toEqual([])
      }

      await expectSquareCorners()
      await expect(editor).toHaveAttribute("data-slot", "card")
      const buttons = await editor.locator('[data-slot="button"]').evaluateAll((elements) =>
        elements.map((element) => {
          const styles = getComputedStyle(element)
          return {
            fontSize: styles.fontSize, fontWeight: styles.fontWeight,
            letterSpacing: styles.letterSpacing, textTransform: styles.textTransform,
          }
        }))
      expect(buttons.length).toBeGreaterThan(0)
      for (const styles of buttons) {
        expect(styles).toEqual({ fontSize: "12px", fontWeight: "600", letterSpacing: "1.2px", textTransform: "uppercase" })
      }
      for (const control of [
        page.getByRole("combobox", { name: "Field 1", exact: true }),
        page.getByRole("textbox", { name: "Value 1", exact: true }),
      ]) {
        await expect(control).toHaveCSS("height", "40px")
        await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
        for (const side of ["top", "right", "left"]) {
          await expect(control).toHaveCSS(`border-${side}-color`, "rgba(0, 0, 0, 0)")
        }
        await expect(control).toHaveCSS("border-bottom-width", "1px")
        await control.focus()
        await expect(control).toHaveCSS("box-shadow", "none")
      }
      expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.getByRole("combobox", { name: "Field 1", exact: true }).click()
      await expect(page.getByRole("listbox")).toBeVisible()
      await expectSquareCorners()
      await page.keyboard.press("Escape")
      await editor.getByRole("button", { name: "Save query", exact: true }).click()
      await expect(page.getByRole("dialog", { name: "Save query", exact: true })).toBeVisible()
      await expectSquareCorners()
    })
  }
}

test("query workspace stays within narrow screens and supports dark mode and keyboard tabs", async ({ page }) => {
  await addCondition(page, "Capability", { choice: "Bots" })
  await page.getByRole("tab", { name: "Advanced", exact: true }).click()
  await page.getByRole("button", { name: "Add group", exact: true }).click()
  await choose(page, "Field 2.1", "Teams owned")
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeVisible()
    const overflow = await page.evaluate(() => ({
      width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("body *")]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1 && element.getBoundingClientRect().width > 0)
        .map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0, 60) })).slice(-10),
    }))
    expect(overflow.documentWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(width)
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    for (const path of ["1", "2.1"]) {
      const bounds = await page.getByRole("group", { name: `Condition ${path}`, exact: true }).boundingBox()
      expect(bounds.height).toBeLessThanOrEqual(width >= 640 ? 48 : 92)
    }
    if (width === 390) {
      await page.locator("main").evaluate((element) => { element.scrollTop = 0 })
      await page.screenshot({ path: "test-results/advanced-composite-mobile.png" })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: "Dark", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  const advanced = page.getByRole("tab", { name: "Advanced", exact: true })
  await advanced.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("tabpanel")).toContainText("Prompt generation is not implemented.")
})

test("actual property keys drill into objects and restrict operators to the selected type", async ({ page }) => {
  await addCondition(page, "id", "helper")
  await choose(page, "Operator 1", "is")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await choose(page, "Field 1", "webApplicationInfo")
  await expect(page.getByRole("combobox", { name: "Property 1.1", exact: true })).toBeVisible()
  await choose(page, "Property 1.1", "resource")
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("api://calendar")
  await choose(page, "Operator 1", "is")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar"])
  await expect(page.getByLabel("Query preview", { exact: true })).toHaveText('webApplicationInfo.resource is "api://calendar"')
  await choose(page, "Property 1.1", "id")
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("client-helper")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await choose(page, "Field 1", "amsSellerAccountId")
  await page.getByRole("combobox", { name: "Operator 1", exact: true }).click()
  await expect(page.getByRole("option", { name: "contains", exact: true })).toHaveCount(0)
  await page.getByRole("option", { name: ">", exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
  await page.getByRole("spinbutton", { name: "Value 1", exact: true }).fill("10")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
})

test("array counts expose scoped bot properties, Any/All semantics and primitive item rules", async ({ page }) => {
  await addCondition(page, "bots", "0")
  const items = page.getByRole("group", { name: "Array items 1", exact: true })
  await expect(items).toBeVisible()
  await addCondition(page, "supportsFiles", { choice: "Yes" }, "1.items.1", items)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper", "Other bot"])
  await choose(page, "Item match 1", "All items")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await choose(page, "Item match 1", "Any item")
  await addCondition(page, "id", "bot", "1.items.2", items)
  await choose(page, "Operator 1.items.2", "is")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await addCondition(page, "scopes", "0", "1.items.3", items)
  const scopes = page.getByRole("group", { name: "Array items 1.items.3", exact: true })
  await addCondition(page, "Item value", "team", "1.items.3.items.1", scopes)
  await choose(page, "Operator 1.items.3.items.1", "is")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await page.locator("main").evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: "test-results/adaptive-bot-conditions.png" })
  await page.getByRole("spinbutton", { name: "Value 1", exact: true }).fill("2")
  await choose(page, "Operator 1", "count is")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, [])
  await page.getByRole("spinbutton", { name: "Value 1", exact: true }).fill("0")
  await expect(page.getByRole("alert")).toContainText("cannot match any items")
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toBeDisabled()
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.getByRole("button", { name: "Clear group 1.items", exact: true }).click()
  await expect(page.getByRole("spinbutton", { name: "Value 1", exact: true })).toHaveValue("0")
  await expect(items.getByRole("group", { name: /^Condition \d/ })).toHaveCount(0)
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Preview Helper"])
})

test("rightmost Presets tab loads editable property conditions without running or losing previous results", async ({ page }) => {
  await expect(page.getByRole("tablist", { name: "Query editor mode", exact: true }).getByRole("tab").last()).toHaveText("Presets")
  await page.getByRole("tab", { name: "Presets", exact: true }).click()
  await expect(page.getByRole("tabpanel")).toContainText("bots count > 0")
  await page.getByRole("button", { name: "Use preset Bots", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Build a query, find your apps", exact: true })).toBeVisible()
  await addCondition(page, "developerName", "Microsoft", "2")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Helper"])
  await page.getByRole("tab", { name: "Presets", exact: true }).click()
  await page.getByRole("button", { name: "Use preset Tabs", exact: true }).click()
  await expectResults(page, ["Helper"])
  await expect(page.getByRole("status", { name: "Query status" })).toContainText("Unapplied changes")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Calendar", "Preview Helper"])
})

test("app previews open only the variants matching their tile without constraining later Library details", async ({ page }) => {
  await navigate(page, "Library")
  const tile = page.getByRole("article", { name: "Tabs 2 apps", exact: true })
  const preview = tile.getByRole("button", { name: "Open Preview Helper details", exact: true })
  await preview.click()
  const dialog = page.getByRole("dialog", { name: "Preview Helper", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("tab", { name: "Versions", exact: true }).click()
  await expect(dialog.getByRole("table", { name: "App versions", exact: true }).getByRole("row")).toHaveCount(2)
  await dialog.getByRole("tab", { name: "JSON", exact: true }).click()
  await expect(dialog.locator("pre")).toContainText('"audienceGroup": "ring0"')
  await expect(dialog.locator("pre")).toContainText('"bots": []')
  await page.keyboard.press("Escape")
  await expect(preview).toBeFocused()
  await page.getByRole("table", { name: "App library", exact: true }).getByRole("button", { name: "Helper", exact: true }).click()
  const regularDetails = page.getByRole("dialog", { name: "Helper", exact: true })
  await regularDetails.getByRole("tab", { name: "Versions", exact: true }).click()
  const variants = await page.evaluate(() => window.utils.AUDIENCE_GROUPS.length)
  await expect(regularDetails.getByRole("table", { name: "App versions", exact: true }).getByRole("row")).toHaveCount(variants + 1)
})

test("tile picker offers every preset, enforces six desktop tiles, supports cancel, and runs SPFx after pinning", async ({ page }) => {
  await navigate(page, "Library")
  await expect(page.getByRole("main")).toBeFocused()
  const tiles = page.getByRole("region", { name: "Preset queries", exact: true })
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toHaveCount(0)
  const edit = tiles.getByRole("button", { name: "Edit query tiles", exact: true })
  await edit.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog", { name: "Edit query tiles", exact: true })
  await expect(dialog.getByRole("tabpanel").getByRole("checkbox")).toHaveCount(7)
  const spfx = dialog.getByRole("checkbox", { name: "SPFx Apps", exact: true })
  await expect(spfx).toBeDisabled()
  await expect(dialog.getByRole("status")).toHaveText("6 of 6 tiles selected")
  await dialog.getByRole("checkbox", { name: "Custom Engine Agents", exact: true }).uncheck()
  await expect(dialog.getByRole("status")).toHaveText("5 of 6 tiles selected")
  await expect(dialog.getByRole("button", { name: "Save tiles", exact: true })).toBeDisabled()
  await spfx.check()
  await expect(dialog.getByRole("button", { name: "Save tiles", exact: true })).toBeEnabled()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(edit).toBeFocused()
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toHaveCount(0)
  await edit.click()
  await dialog.getByRole("checkbox", { name: "Custom Engine Agents", exact: true }).uncheck()
  await spfx.check()
  await dialog.getByRole("button", { name: "Save tiles", exact: true }).click()
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await page.reload()
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toBeEnabled()
  await tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true }).click()
  await expectResults(page, ["Calendar"])
  await expect(page.getByRole("region", { name: "Selected preset query", exact: true })).toHaveCount(0)
  await expect(page.getByText("Starting point", { exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Applied query", { exact: true })).toContainText('contentUrl contains "{teamSiteDomain}"')
  await expect(page.getByLabel("Applied query", { exact: true })).toContainText('contentUrl contains "{mySiteDomain}"')
})

test("mobile tile selections stay independent, enforce four squares, and persist across viewport changes", async ({ page }) => {
  await navigate(page, "Library")
  await page.setViewportSize({ width: 390, height: 844 })
  const tiles = page.getByRole("region", { name: "Preset queries", exact: true })
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(4)
  await tiles.getByRole("button", { name: "Edit query tiles", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Edit query tiles", exact: true })
  await expect(dialog.getByRole("tab", { name: "Mobile (4)", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(dialog.getByRole("status")).toHaveText("4 of 4 tiles selected")
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(dialog.getByRole("button", { name: "Create query", exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const spfx = dialog.getByRole("checkbox", { name: "SPFx Apps", exact: true })
  await expect(spfx).toBeDisabled()
  await dialog.getByRole("checkbox", { name: "Custom Engine Agents", exact: true }).uncheck()
  await spfx.check()
  await expect(dialog.getByRole("checkbox", { name: "Bot Only Apps", exact: true })).toBeDisabled()
  await dialog.getByRole("button", { name: "Save tiles", exact: true }).click()
  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(tiles.locator("[data-query-tile]")).toHaveCount(4)
    await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toBeVisible()
    const boxes = await tiles.locator("[data-query-tile]").evaluateAll((buttons) =>
      buttons.map((button) => {
        const { x, y, width, height } = button.getBoundingClientRect()
        return { x, y, width, height, overflow: button.scrollHeight > button.clientHeight }
      }))
    for (const box of boxes) {
      expect(box.width).toBeCloseTo(box.height, 0)
      expect(box.overflow).toBe(false)
    }
    expect(boxes[0].y).toBe(boxes[1].y)
    expect(boxes[2].y).toBe(boxes[3].y)
    expect(boxes[0].x).toBe(boxes[2].x)
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y)
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.reload()
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toHaveCount(0)
})

test("pinned saved-query tiles update with saved conditions and restore a default after deletion", async ({ page }) => {
  await addCondition(page, "developerName", "Microsoft")
  await page.getByRole("button", { name: "Save query", exact: true }).click()
  const save = page.getByRole("dialog", { name: "Save query", exact: true })
  await save.getByRole("textbox", { name: "Query name", exact: true }).fill("My developer query")
  await save.getByRole("button", { name: "Save", exact: true }).click()
  await navigate(page, "Library")
  const tiles = page.getByRole("region", { name: "Preset queries", exact: true })
  await tiles.getByRole("button", { name: "Edit query tiles", exact: true }).click()
  const picker = page.getByRole("dialog", { name: "Edit query tiles", exact: true })
  await picker.getByRole("checkbox", { name: "Message Extensions", exact: true }).uncheck()
  await picker.getByRole("checkbox", { name: "My developer query", exact: true }).check()
  await picker.getByRole("button", { name: "Save tiles", exact: true }).click()
  const savedTile = page.getByRole("article", { name: "My developer query 2 apps", exact: true })
  await expect(savedTile.getByRole("list").getByRole("button")).toHaveCount(2)
  await savedTile.getByRole("button", { name: "Open Helper details", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Helper", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await tiles.getByRole("button", { name: "My developer query 2 apps", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("Contoso")
  await page.getByRole("button", { name: "Save query", exact: true }).click()
  await save.getByRole("textbox", { name: "Query name", exact: true }).fill("My developer query")
  await save.getByRole("button", { name: "Save", exact: true }).click()
  await navigate(page, "Library")
  await expect(tiles.getByRole("button", { name: "My developer query 2 apps", exact: true })).toHaveCount(0)
  await expect(page.getByRole("article", { name: "My developer query 1 app", exact: true })
    .getByRole("list").getByRole("button")).toHaveAccessibleName("Open Other bot details")
  await tiles.getByRole("button", { name: "My developer query 1 app", exact: true }).click()
  await expectResults(page, ["Other bot"])
  await page.getByRole("tab", { name: "Presets", exact: true }).click()
  await page.getByRole("button", { name: "Delete saved query My developer query", exact: true }).click()
  await navigate(page, "Library")
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await expect(tiles.getByRole("button", { name: /My developer query/ })).toHaveCount(0)
  await expect(tiles.getByRole("button", { name: "Message Extensions 0 apps", exact: true })).toBeVisible()
  await page.reload()
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await expect(tiles.getByRole("button", { name: "Message Extensions 0 apps", exact: true })).toBeVisible()
})

test("the tile picker creates queries through Advanced and shares its saved query list", async ({ page }) => {
  await addCondition(page, "name", "Discard this draft")
  await navigate(page, "Library")
  const tiles = page.getByRole("region", { name: "Preset queries", exact: true })
  await tiles.getByRole("button", { name: "Edit query tiles", exact: true }).click()
  const picker = page.getByRole("dialog", { name: "Edit query tiles", exact: true })
  await picker.getByRole("button", { name: "Create query", exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(page.getByRole("navigation").getByRole("button", { name: "Advanced", exact: true }))
    .toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("region", { name: "Query editor", exact: true })).toBeVisible()
  await expect(page.getByRole("group", { name: "Condition 1", exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Build a query, find your apps", exact: true })).toBeVisible()
  await addCondition(page, "developerName", "Microsoft")
  await page.getByRole("button", { name: "Save query", exact: true }).click()
  const save = page.getByRole("dialog", { name: "Save query", exact: true })
  await save.getByRole("textbox", { name: "Query name", exact: true }).fill("Pinned Microsoft apps")
  await save.getByRole("button", { name: "Save", exact: true }).click()
  await expect(save).toBeHidden()
  await navigate(page, "Library")
  await tiles.getByRole("button", { name: "Edit query tiles", exact: true }).click()
  const choice = picker.getByRole("checkbox", { name: "Pinned Microsoft apps", exact: true })
  await expect(choice).toBeVisible()
  await expect(choice).toBeDisabled()
  await picker.getByRole("checkbox", { name: "Message Extensions", exact: true }).uncheck()
  await expect(picker.getByRole("button", { name: "Save tiles", exact: true })).toBeDisabled()
  await choice.check()
  await expect(picker.getByRole("status")).toHaveText("6 of 6 tiles selected")
  await picker.screenshot({ path: "test-results/query-tile-picker.png", animations: "disabled" })
  await picker.getByRole("button", { name: "Save tiles", exact: true }).click()
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await expect(tiles.getByRole("button", { name: "Pinned Microsoft apps 2 apps", exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-explorer.queries.v1")).length)).toBe(1)
  await page.reload()
  await expect(tiles.getByRole("button", { name: "Pinned Microsoft apps 2 apps", exact: true })).toBeEnabled()
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await tiles.screenshot({ path: "test-results/custom-query-tiles.png", animations: "disabled" })
  await tiles.getByRole("button", { name: "Pinned Microsoft apps 2 apps", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper"])
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Microsoft")
})

test("legacy incomplete desktop selections recover six slots without filling an intentionally empty mobile layout", async ({ page }) => {
  await page.evaluate(() => {
    const key = "catalog-explorer.preferences.v1"
    const preferences = JSON.parse(localStorage.getItem(key) || "{}")
    localStorage.setItem(key, JSON.stringify({
      ...preferences, queryTiles: { desktop: ["preset:bots"], mobile: [] },
    }))
  })
  await page.reload()
  const tiles = page.getByRole("region", { name: "Preset queries", exact: true })
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(6)
  await expect(tiles.locator("[data-query-tile]").first().getByRole("heading")).toHaveText("Bots")
  await tiles.getByRole("button", { name: "Edit query tiles", exact: true }).click()
  const picker = page.getByRole("dialog", { name: "Edit query tiles", exact: true })
  await expect(picker.getByRole("status")).toHaveText("6 of 6 tiles selected")
  await picker.getByRole("button", { name: "Save tiles", exact: true }).click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-explorer.preferences.v1")).queryTiles)
  expect(saved.desktop).toHaveLength(6)
  expect(saved.desktop[0]).toBe("preset:bots")
  expect(saved.mobile).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(tiles.locator("[data-query-tile]")).toHaveCount(0)
})

test("tile preference storage failures report session-only changes", async ({ page }) => {
  await navigate(page, "Library")
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === "catalog-explorer.preferences.v1") throw new DOMException("Storage is full", "QuotaExceededError")
      return setItem.call(this, key, value)
    }
  })
  const tiles = page.getByRole("region", { name: "Preset queries", exact: true })
  await tiles.getByRole("button", { name: "Edit query tiles", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Edit query tiles", exact: true })
  await dialog.getByRole("checkbox", { name: "Custom Engine Agents", exact: true }).uncheck()
  await dialog.getByRole("checkbox", { name: "SPFx Apps", exact: true }).check()
  await dialog.getByRole("button", { name: "Save tiles", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Cannot save settings. Changes apply to this session only.")
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toBeVisible()
  await page.reload()
  await expect(tiles.getByRole("button", { name: "SPFx Apps 1 app", exact: true })).toHaveCount(0)
})

test("bottom-right Save persists named queries, supports updates, and exposes saved queries in Presets after reload", async ({ page }) => {
  await addCondition(page, "developerName", "Microsoft")
  const editor = page.getByRole("region", { name: "Query editor", exact: true })
  const save = editor.getByRole("button", { name: "Save query", exact: true })
  const editorBounds = await editor.boundingBox()
  const saveBounds = await save.boundingBox()
  expect(editorBounds.x + editorBounds.width - saveBounds.x - saveBounds.width).toBeLessThanOrEqual(18)
  expect(editorBounds.y + editorBounds.height - saveBounds.y - saveBounds.height).toBeLessThanOrEqual(18)
  await save.click()
  const dialog = page.getByRole("dialog", { name: "Save query", exact: true })
  await dialog.getByRole("textbox", { name: "Query name", exact: true }).fill("My developer query")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(editor.getByRole("status").filter({ hasText: "Saved" })).toContainText('Saved "My developer query"')
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("Contoso")
  await expect(editor.getByText('Saved "My developer query" in this browser.', { exact: true })).toHaveCount(0)
  await save.click()
  await expect(dialog).toContainText("replaces its existing saved conditions")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-explorer.queries.v1")).length)).toBe(1)
  await page.reload()
  await navigate(page, "Advanced")
  await page.getByRole("tab", { name: "Presets", exact: true }).click()
  await page.getByRole("button", { name: "Load saved query My developer query", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Contoso")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expectResults(page, ["Other bot"])
  await page.getByRole("tab", { name: "Presets", exact: true }).click()
  await page.getByRole("button", { name: "Delete saved query My developer query", exact: true }).click()
  await expect(page.getByRole("button", { name: "Load saved query My developer query", exact: true })).toHaveCount(0)
})

test("saving reports storage failures without reporting success or losing the draft", async ({ page }) => {
  await addCondition(page, "name", "Helper")
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === "catalog-explorer.queries.v1") throw new DOMException("Storage is full", "QuotaExceededError")
      return setItem.call(this, key, value)
    }
  })
  await page.getByRole("button", { name: "Save query", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Save query", exact: true })
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Cannot save queries")
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("catalog-explorer.queries.v1"))).toBeNull()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Value 1", exact: true })).toHaveValue("Helper")
})

test("Export results downloads all matches rather than the current page or an unapplied draft", async ({ page }) => {
  const manyApps = Array.from({ length: 31 }, (_, index) => ({
    id: `export-${index}`, name: `Export app ${String(index).padStart(2, "0")}`, developerName: "Example",
  }))
  await page.route("https://catalog.test/**", (route) => route.fulfill({ json: { value:
    route.request().url().includes("entitlements") ? { appEntitlements: {} } : { appDefinitions: manyApps },
  } }))
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByText("26-31 of 31 apps", { exact: true })).toBeVisible()
  await addCondition(page, "name", "not-applied")
  await page.getByRole("button", { name: "Export results", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Export results", exact: true })
  await expect(dialog.getByRole("radio", { name: "Full dump", exact: true })).toBeChecked()
  const { filename, payload } = await readExport(page, dialog)
  expect(filename).toBe("catalog-results.json")
  expect(payload.appCount).toBe(31)
  expect(payload.apps.map(({ appId }) => appId).sort()).toEqual(manyApps.map(({ id }) => id).sort())
  expect(payload.query.children).toEqual([])
  expect(payload.apps.every(({ variants }) => variants.length === 9)).toBe(true)
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await expect(page.getByRole("button", { name: "Export results", exact: true })).toBeDisabled()
})

test("export failures are visible and do not change the current results", async ({ page }) => {
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await page.evaluate(() => {
    URL.createObjectURL = () => { throw new Error("Download unavailable") }
  })
  await page.getByRole("button", { name: "Export results", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Export results", exact: true })
  await dialog.getByRole("button", { name: "Export JSON", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Cannot export results")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expectResults(page, ["Calendar", "Helper", "Other bot"])
})

for (const target of ["Advanced", "Library"]) {
  for (const fields of [["App Name"], ["App ID"], ["Developer"], ["App Name", "App ID", "Developer"]]) {
    test(`${target} export offers only the selected ${fields.join(", ")} fields`, async ({ page }) => {
      if (target === "Advanced") await page.getByRole("button", { name: "Run query", exact: true }).click()
      else await navigate(page, "Library")
      await page.getByRole("button", { name: "Export results", exact: true }).click()
      const dialog = page.getByRole("dialog", { name: "Export results", exact: true })
      await expect(dialog).toBeVisible()
      await selectExportFields(dialog, fields)
      const { filename, payload } = await readExport(page, dialog)
      expect(filename).toBe("catalog-results-fields.json")
      const selectedKeys = { "App Name": "name", "App ID": "id", Developer: "developerName" }
      const expected = [apps[1], apps[0], apps[2]].map((app) => Object.fromEntries(
        fields.map((field) => [selectedKeys[field], app[selectedKeys[field]]]),
      ))
      expect(payload).toEqual(expected)
    })
  }
}

test("export chooser validates field selection, supports cancel, and fits narrow screens", async ({ page }) => {
  let downloads = 0
  page.on("download", () => { downloads += 1 })
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await page.getByRole("button", { name: "Export results", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Export results", exact: true })
  await selectExportFields(dialog, [])
  await expect(dialog.getByRole("alert")).toHaveText("Select at least one field to export.")
  await expect(dialog.getByRole("button", { name: "Export JSON", exact: true })).toBeDisabled()
  await dialog.getByRole("checkbox", { name: "App Name", exact: true }).check()
  await expect(dialog.getByRole("button", { name: "Export JSON", exact: true })).toBeEnabled()
  await dialog.getByRole("radio", { name: "Full dump", exact: true }).check()
  await expect(dialog.getByRole("checkbox", { name: "App Name", exact: true })).toBeDisabled()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 })
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const bounds = await dialog.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  }
  await page.screenshot({ path: "test-results/export-chooser-mobile.png" })
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(downloads).toBe(0)
})

test("field exports use the displayed ring variant without exposing query or definition metadata", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await navigate(page, "Advanced")
  await page.getByRole("button", { name: "Run query", exact: true }).click()
  await choose(page, "Filter by ring", "R0")
  await page.getByRole("button", { name: "Export results", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Export results", exact: true })
  await selectExportFields(dialog, ["App Name", "App ID"])
  const { payload } = await readExport(page, dialog)
  expect(payload).toEqual([
    { name: "Calendar", id: "calendar" },
    { name: "Other bot", id: "other" },
    { name: "Preview Helper", id: "helper" },
  ])
})
