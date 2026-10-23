import { expect, test } from "@playwright/test"

const longKey = `long-property-${"k".repeat(180)}`
const longValue = `https://example.test/${"segment".repeat(90)}`
const definition = {
  id: "directory-app",
  name: "Directory example",
  developerName: "Example developer",
  version: "1.0.0",
  manifestVersion: "1.19",
  description: "Directory definition description",
  shortDescription: "Directory short description",
  longDescription: "Directory long description",
  sourceType: "store",
  unmappedProperty: "unmapped-field-value",
  configuration: {
    services: [{
      name: "Directory service",
      options: {
        endpoint: "needle-endpoint",
        missing: null,
        emptyText: "",
        enabled: false,
        retries: 0,
        emptyObject: {},
        emptyArray: [],
        [longKey]: longValue,
      },
    }],
    unrelated: "outside-the-match",
  },
  "a.b": { "quote\"/[]": "special-path-value" },
  a: { b: { "quote\"/[]": "different-path-value" } },
}

async function mockDirectoryCatalog(page, appDefinition = definition) {
  await page.route("https://config.edge.skype.com/**", async (route) => {
    const audience = new URL(route.request().url()).searchParams.get("AudienceGroup")
    return route.fulfill({ json: { MicrosoftTeamsAppCatalog: { appCatalog: {
      storeAppDefinitions: { sources: [`https://catalog.test/${audience === "ring0" ? "preview" : "directory"}.json`] },
      preconfiguredAppEntitlements: { sources: ["https://catalog.test/entitlements.json"] },
    } } } })
  })
  await page.route("https://catalog.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/entitlements.json") return route.fulfill({ json: { value: { appEntitlements: {} } } })
    const app = path === "/preview.json"
      ? { ...appDefinition, version: "2.0.0", configuration: { previewOnly: "preview-value" } }
      : appDefinition
    return route.fulfill({ json: { value: { appDefinitions: [app] } } })
  })
}

async function openDefinition(page) {
  await page.goto("/")
  await expect(page.getByRole("button", { name: /^(Refresh|Retry)$/ })).toBeEnabled()
  await page.getByRole("button", { name: "Directory example", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Directory example" })
  await dialog.getByRole("tab", { name: "Definition", exact: true }).click()
  const directory = dialog.getByRole("region", { name: "Definition directory" })
  await expect(directory).toBeVisible()
  return { dialog, directory }
}

function row(directory, path) {
  return directory.locator(`[data-definition-path=${JSON.stringify(path)}]`)
}

function group(directory, name) {
  return directory.getByRole("region", { name, exact: true })
    .or(directory.getByRole("heading", { name, exact: true }).locator("xpath=ancestor::section[1]"))
    .first()
}

const optionsPath = '$["configuration"]["services"][0]["options"]'

test.beforeEach(async ({ page }) => {
  await mockDirectoryCatalog(page)
})

test("definition groups retain field membership, order, and original paths", async ({ page }) => {
  const { directory } = await openDefinition(page)
  const versionGroup = group(directory, "Version Information")
  const coreGroup = group(directory, "Core App Properties")
  const otherGroup = group(directory, "Other Properties")
  await expect(versionGroup).toBeVisible()
  await expect(coreGroup).toBeVisible()
  await expect(otherGroup).toBeVisible()
  expect(await versionGroup.evaluate(
    (version, core) => Boolean(version.compareDocumentPosition(core) & Node.DOCUMENT_POSITION_FOLLOWING),
    await coreGroup.elementHandle(),
  )).toBe(true)
  expect(await coreGroup.evaluate(
    (core, other) => Boolean(core.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
    await otherGroup.elementHandle(),
  )).toBe(true)
  for (const key of ["version", "sourceType"]) {
    await expect(row(versionGroup, `$[${JSON.stringify(key)}]`)).toBeVisible()
    await expect(row(coreGroup, `$[${JSON.stringify(key)}]`)).toHaveCount(0)
  }
  for (const key of ["id", "manifestVersion", "name", "description", "shortDescription", "longDescription"]) {
    await expect(row(coreGroup, `$[${JSON.stringify(key)}]`)).toBeVisible()
    await expect(row(versionGroup, `$[${JSON.stringify(key)}]`)).toHaveCount(0)
  }
  await expect(row(otherGroup, '$["unmappedProperty"]')).toContainText("unmapped-field-value")
  for (const key of Object.keys(definition)) {
    const property = row(directory, `$[${JSON.stringify(key)}]`)
    await expect(property).toHaveCount(1)
    await expect(property.getByText(key, { exact: true }).first()).toBeVisible()
  }
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await expect(row(directory, `${optionsPath}["endpoint"]`)).toHaveCount(1)
  await expect(row(directory, `${optionsPath}["endpoint"]`)).toContainText("needle-endpoint")
  await page.screenshot({ path: "test-results/definition-groups-desktop.png", fullPage: true })
})

test("absent properties do not create placeholder fields or an empty fallback group", async ({ page }) => {
  await mockDirectoryCatalog(page, { id: "directory-app", name: "Directory example", version: "1.0.0" })
  const { directory } = await openDefinition(page)
  await expect(group(directory, "Version Information")).toBeVisible()
  await expect(group(directory, "Core App Properties")).toBeVisible()
  await expect(group(directory, "Other Properties")).toHaveCount(0)
  for (const key of ["manifestVersion", "description", "shortDescription", "longDescription", "unmappedProperty"]) {
    await expect(row(directory, `$[${JSON.stringify(key)}]`)).toHaveCount(0)
  }
})

test("object and array disclosures use data icons and preserve falsy and empty values", async ({ page }) => {
  const { directory } = await openDefinition(page)
  const configuration = row(directory, '$["configuration"]').locator(":scope > details")
  await expect(configuration).not.toHaveAttribute("open")
  await configuration.locator(":scope > summary").focus()
  await page.keyboard.press("Enter")
  await expect(configuration).toHaveAttribute("open", "")
  await expect(configuration.locator(":scope > summary .tabler-icon-braces")).toBeVisible()
  await expect(row(directory, '$["configuration"]["services"]').locator(":scope > details > summary .tabler-icon-brackets")).toBeVisible()
  await expect(row(directory, '$["configuration"]["services"]').locator(":scope > details > summary")).toContainText("1 item")
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await expect(row(directory, `${optionsPath}["endpoint"]`).locator('svg[data-icon="quote-left"]')).toBeVisible()
  const quoteIcon = row(directory, `${optionsPath}["endpoint"]`).locator('svg[data-icon="quote-left"]')
  const arrayIcon = row(directory, '$["configuration"]["services"]').locator(":scope > details > summary .tabler-icon-brackets")
  await expect(quoteIcon).toHaveCSS("width", "12px")
  await expect(quoteIcon).toHaveCSS("height", "12px")
  await expect(quoteIcon).toHaveCSS("color", await arrayIcon.evaluate((icon) => getComputedStyle(icon).color))
  await expect(directory.locator(".tabler-icon-key, .tabler-icon-file-text, .tabler-icon-folder, .tabler-icon-folder-open")).toHaveCount(0)
  for (const [key, value] of [["missing", "null"], ["emptyText", '""'], ["enabled", "false"], ["retries", "0"]]) {
    await expect(row(directory, `${optionsPath}[${JSON.stringify(key)}]`).getByText(value, { exact: true }).first()).toBeVisible()
  }
  await expect(row(directory, `${optionsPath}["emptyObject"]`)).toContainText("0 properties")
  await expect(row(directory, `${optionsPath}["emptyObject"]`).getByText("Empty object", { exact: true })).toBeVisible()
  await expect(row(directory, `${optionsPath}["emptyArray"]`).getByText("Empty array", { exact: true })).toBeVisible()
  await expect(row(directory, '$["a.b"]["quote\\"/[]"]').getByText("special-path-value", { exact: true })).toBeVisible()
  await expect(row(directory, '$["a"]["b"]["quote\\"/[]"]').getByText("different-path-value", { exact: true })).toBeVisible()
  await directory.getByRole("button", { name: "Collapse all", exact: true }).click()
  await expect(configuration).not.toHaveAttribute("open")
  await expect(row(directory, `${optionsPath}["endpoint"]`)).toBeHidden()
})

test("key, value, and exact path search retain ancestors and show no-match feedback", async ({ page }) => {
  const { directory } = await openDefinition(page)
  const search = directory.getByRole("textbox", { name: "Search definition" })
  for (const query of ["ENDPOINT", "needle-endpoint", `${optionsPath}["endpoint"]`]) {
    await search.fill(query)
    await expect(row(directory, `${optionsPath}["endpoint"]`).getByText("needle-endpoint", { exact: true })).toBeVisible()
    await expect(row(directory, '$["configuration"]').locator(":scope > details")).toHaveAttribute("open", "")
    await expect(row(directory, '$["configuration"]["services"][0]').locator(":scope > details")).toHaveAttribute("open", "")
    await expect(directory.getByText("outside-the-match", { exact: true })).toHaveCount(0)
    await expect(group(directory, "Version Information")).toHaveCount(0)
    await expect(group(directory, "Core App Properties")).toHaveCount(0)
  }
  await directory.getByRole("button", { name: "Collapse all", exact: true }).click()
  await expect(row(directory, `${optionsPath}["endpoint"]`)).toBeHidden()
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await expect(row(directory, `${optionsPath}["endpoint"]`)).toBeVisible()
  await search.fill("nothing-in-this-definition")
  await expect(directory.getByRole("status")).toHaveText("No matching properties.")
  await directory.getByRole("button", { name: "Clear search", exact: true }).click()
  await expect(search).toHaveValue("")
  await expect(directory.getByRole("status")).toHaveCount(0)
  await expect(row(directory, '$["configuration"]')).toBeVisible()
  for (const [query, name, path] of [
    ["1.0.0", "Version Information", '$["version"]'],
    ["shortDescription", "Core App Properties", '$["shortDescription"]'],
    ["unmapped-field-value", "Other Properties", '$["unmappedProperty"]'],
  ]) {
    await search.fill(query)
    await expect(row(group(directory, name), path)).toBeVisible()
    for (const otherName of ["Version Information", "Core App Properties", "Other Properties"].filter((candidate) => candidate !== name)) {
      await expect(group(directory, otherName)).toHaveCount(0)
    }
  }
})

test("hidden ring data is not searchable and enabled ring settings expose it", async ({ page }) => {
  const { directory } = await openDefinition(page)
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await expect(directory.getByText("audienceGroup", { exact: true })).toHaveCount(0)
  await directory.getByRole("textbox", { name: "Search definition" }).fill("audienceGroup")
  await expect(directory.getByRole("status")).toHaveText("No matching properties.")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("switch", { name: "Ring information", exact: true }).click()
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Library", exact: true }).click()
  await page.getByRole("button", { name: "Directory example", exact: true }).click()
  await page.getByRole("dialog").getByRole("tab", { name: "Definition", exact: true }).click()
  const visibleDirectory = page.getByRole("region", { name: "Definition directory" })
  await visibleDirectory.getByRole("textbox", { name: "Search definition" }).fill("audienceGroup")
  await expect(visibleDirectory.getByText("audienceGroup", { exact: true })).toBeVisible()
  await expect(row(group(visibleDirectory, "Version Information"), '$["audienceGroup"]')).toBeVisible()
  await expect(row(visibleDirectory, '$["audienceGroup"]')).toHaveCount(1)
  await expect(group(visibleDirectory, "Core App Properties")).toHaveCount(0)
  await expect(visibleDirectory.getByRole("status")).toHaveCount(0)
})

test("switching variants resets directory search and expansion", async ({ page }) => {
  const { dialog, directory } = await openDefinition(page)
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await directory.getByRole("textbox", { name: "Search definition" }).fill("needle-endpoint")
  await dialog.getByRole("combobox", { name: "App variant" }).click()
  await page.getByRole("option", { name: /2\.0\.0/ }).click()
  await expect(directory.getByRole("textbox", { name: "Search definition" })).toHaveValue("")
  await expect(row(group(directory, "Version Information"), '$["version"]')).toContainText("2.0.0")
  await expect(group(directory, "Core App Properties")).toBeVisible()
  await expect(row(directory, '$["configuration"]').locator(":scope > details")).not.toHaveAttribute("open")
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await expect(directory.getByText("preview-value", { exact: true })).toBeVisible()
  await expect(directory.getByText("needle-endpoint", { exact: true })).toHaveCount(0)
  await dialog.getByRole("combobox", { name: "App variant" }).click()
  await page.getByRole("option", { name: /1\.0\.0/ }).first().click()
  await expect(row(directory, '$["configuration"]').locator(":scope > details")).not.toHaveAttribute("open")
  await expect(row(group(directory, "Version Information"), '$["version"]')).toContainText("1.0.0")
})

test("long keys and strings wrap inside a narrow popup without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const { dialog, directory } = await openDefinition(page)
  await directory.getByRole("button", { name: "Expand all", exact: true }).click()
  await expect(directory.getByText(longKey, { exact: true })).toBeVisible()
  await expect(directory.getByText(longValue, { exact: true })).toBeVisible()
  expect(await directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: "test-results/definition-groups-mobile.png", fullPage: true })
})
