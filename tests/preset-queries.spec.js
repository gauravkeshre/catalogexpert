import { expect, test } from "@playwright/test"
import { countPresetQueries, filterPresetDefinitions } from "../src/lib/preset-queries.js"

function counts(variants, audience = "all") {
  const definitions = new Map([["app", new Map(variants)]])
  return Object.fromEntries(countPresetQueries(definitions, audience).map(({ id, appCount }) => [id, appCount]))
}

test("catalog and manifest capability fields use the same query categories", () => {
  const catalog = {
    customEngineCopilots: [{ id: "engine" }],
    copilotGpts: [{ id: "declarative" }],
    bots: [{ id: "bot" }],
    galleryTabs: [{ configurationUrl: "https://example.test" }],
    inputExtensions: [{ botId: "extension" }],
  }
  const manifest = {
    copilotAgents: { customEngineAgents: [{ id: "engine" }], declarativeAgents: [{ id: "declarative" }] },
    bots: [{ botId: "bot" }],
    configurableTabs: [{ configurationUrl: "https://example.test" }],
    composeExtensions: [{ botId: "extension" }],
  }
  for (const app of [catalog, manifest]) {
    expect(counts([["general", app]])).toEqual({
      customEngine: 1, declarative: 1, bots: 1, tabs: 1, botOnly: 0, messageExtensions: 1, spfx: 0,
    })
  }
  expect(counts([["general", { staticTabs: [{ entityId: "tab" }] }]]).tabs).toBe(1)
  expect(counts([["general", { customBots: [{ id: "bot" }] }]]).bots).toBe(1)
})

test("counts include each app once per query and evaluate bot-only within a single variant", () => {
  const definitions = new Map([
    ["mixed", new Map([
      ["general", { bots: [{ id: "bot" }], staticTabs: [{ entityId: "tab" }] }],
      ["ring0", { bots: [{ id: "bot" }], inputExtensions: [{ botId: "extension" }] }],
    ])],
    ["bot-only-in-general", new Map([
      ["general", { bots: [{ id: "bot" }] }],
      ["ring0", { staticTabs: [{ entityId: "tab" }] }],
    ])],
  ])
  const result = Object.fromEntries(countPresetQueries(definitions).map(({ id, appCount }) => [id, appCount]))
  expect(result).toEqual({ customEngine: 0, declarative: 0, bots: 2, tabs: 2, botOnly: 1, messageExtensions: 1, spfx: 0 })
  const preview = Object.fromEntries(countPresetQueries(definitions, "ring0").map(({ id, appCount }) => [id, appCount]))
  expect(preview).toEqual({ customEngine: 0, declarative: 0, bots: 1, tabs: 1, botOnly: 0, messageExtensions: 1, spfx: 0 })
})

test("empty and malformed capability values are not evidence", () => {
  const app = {
    bots: [null, {}, []], customBots: false, staticTabs: [], galleryTabs: null,
    configurableTabs: "", inputExtensions: {}, composeExtensions: "unsupported",
    copilotGpts: [], customEngineCopilots: {},
    copilotAgents: { customEngineAgents: [], declarativeAgents: [null, {}] },
    isCopilotPluginSupported: true, copilotEnabled: true,
  }
  expect(Object.values(counts([["general", app]]))).toEqual([0, 0, 0, 0, 0, 0, 0])
  expect(Object.values(counts([["general", { bots: [{ id: "bot" }] }]], "missing-ring"))).toEqual([0, 0, 0, 0, 0, 0, 0])
})

test("bot-only excludes agent, tab, extension, and other detected capabilities", () => {
  const bot = { bots: [{ id: "bot" }] }
  expect(counts([["general", bot]]).botOnly).toBe(1)
  for (const capability of [
    "customEngineCopilots", "copilotGpts", "staticTabs", "galleryTabs", "configurableTabs",
    "inputExtensions", "composeExtensions", "connectors", "plugins", "extensions",
    "mobileModules", "hostedCapabilities", "meetingExtensionDefinition", "extensionItems",
    "dashboardCards", "copilotActions", "officeAddInElementItem", "exchangeAddInElementItem", "graphConnector",
  ]) {
    expect(counts([["general", { ...bot, [capability]: [{ id: "other" }] }]]).botOnly).toBe(0)
  }
})

test("preset results contain only matching variants and agree with unique app counts", () => {
  const bot = { id: "bot", name: "Bot", bots: [{ id: "bot" }] }
  const tab = { id: "bot", name: "Tab variant", staticTabs: [{ entityId: "tab" }] }
  const agent = { id: "agent", customEngineCopilots: [{ id: "engine" }], copilotGpts: [{ id: "declarative" }] }
  const extension = { id: "extension", composeExtensions: [{ botId: "extension" }] }
  const definitions = new Map([
    ["bot", new Map([["general", bot], ["ring0", tab]])],
    ["agent", new Map([["general", agent], ["ring0", agent]])],
    ["extension", new Map([["general", extension]])],
  ])
  for (const audience of ["all", "general", "ring0", "missing-ring"]) {
    for (const { id, appCount } of countPresetQueries(definitions, audience)) {
      const results = filterPresetDefinitions(definitions, id, audience)
      expect(results.size).toBe(appCount)
      if (audience !== "all") {
        for (const variants of results.values()) expect([...variants.keys()]).toEqual([audience])
      }
    }
  }
  expect([...filterPresetDefinitions(definitions, "bots").get("bot")]).toEqual([["general", bot]])
  expect([...filterPresetDefinitions(definitions, "tabs").get("bot")]).toEqual([["ring0", tab]])
  expect([...filterPresetDefinitions(definitions, "botOnly").keys()]).toEqual(["bot"])
  expect([...definitions.get("bot").keys()]).toEqual(["general", "ring0"])
  expect(filterPresetDefinitions(definitions, "bots").get("bot").get("general")).toBe(bot)
})

test("preset results reject unknown queries and handle empty catalogs", () => {
  expect(filterPresetDefinitions(new Map(), "bots").size).toBe(0)
  expect(() => filterPresetDefinitions(new Map(), "unknown")).toThrow("Unknown preset query: unknown")
})
