import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import {
  canUseSimple, createCondition, createGroup, describeQuery, filterQueryDefinitions, queryForPreset, validateQuery,
} from "../src/lib/app-query.js"
import { defaultPresetQueries, filterPresetDefinitions, presetQueries, spfxUrlPaths } from "../src/lib/preset-queries.js"
import { appDefinitionSchema, buildAppDefinitionSchema, propertyAt } from "../src/lib/app-definition-schema.js"

const bot = {
  id: "bot", name: "Helper", developerName: "Microsoft", version: "1.0",
  bots: [{ id: "bot" }], categories: ["Productivity", "Business"], isTeamsOwned: true,
}
const tab = { id: "tab", name: "Calendar", developerName: "Contoso", staticTabs: [{ id: "tab" }], isTeamsOwned: false }
const definitions = new Map([
  ["bot", new Map([["general", bot], ["ring0", { ...bot, name: "Preview Helper", bots: [], staticTabs: [{ id: "tab" }] }]])],
  ["tab", new Map([["general", tab]])],
])
const entitlements = new Map([["bot", new Map([
  ["general.user.personal", { state: "Installed" }],
  ["ring0.user.personal", { state: "Featured" }],
])]])

function condition(field, value, operator = "equals") {
  return { ...createCondition(field, value), operator }
}

function group(children, match = "all") {
  return { ...createGroup(), children, match }
}

function results(query, audience = "all") {
  return filterQueryDefinitions(definitions, entitlements, query, audience)
}

test("AND/OR queries compose recursively and preserve matching variants without mutating definitions", () => {
  const eitherCapability = group([condition("@capability", "bots"), condition("@capability", "tabs")], "any")
  const query = group([condition("developerName", "MICROSOFT"), eitherCapability])
  const result = results(query)
  expect([...result.keys()]).toEqual(["bot"])
  expect([...result.get("bot").keys()]).toEqual(["general", "ring0"])
  expect(result.get("bot").get("general")).toBe(bot)
  expect([...results(query, "ring0").get("bot").keys()]).toEqual(["ring0"])
  expect(results(query, "missing").size).toBe(0)
  expect(definitions.get("bot").size).toBe(2)
  expect(results(group([condition("name", "Preview", "contains"), condition("@capability", "bots")])).size).toBe(0)
  expect(results(group([condition("name", "Helper"), group([condition("@capability", "bots")])])).size).toBe(1)
})

test("empty queries return every unique app regardless of match selector; empty nested groups are invalid", () => {
  for (const match of ["all", "any"]) expect(results(group([], match)).size).toBe(2)
  const query = group([group([])])
  expect(validateQuery(query)).toContain("empty group")
  expect(() => results(query)).toThrow("empty group")
})

test("string properties handle exact, partial, negative, prefix and missing values literally", () => {
  for (const [query, ids] of [
    [condition("name", "help", "contains"), ["bot"]],
    [condition("name", "help", "startsWith"), ["bot"]],
    [condition("name", "help"), []],
    [condition("name", "helper", "notEquals"), ["bot", "tab"]],
    [condition("name", "helper", "notContains"), ["tab"]],
    [condition("description", "", "empty"), ["bot", "tab"]],
    [condition("description", "", "notEmpty"), []],
    [condition("name", "[*", "contains"), []],
    [condition("name", "Helper OR Calendar"), []],
    [condition("id", "bot"), ["bot"]],
  ]) expect([...results(group([query])).keys()]).toEqual(ids)
})

test("boolean No means explicit false, not missing, and entitlement conditions stay in the same ring", () => {
  expect([...results(group([condition("isTeamsOwned", "true")])).keys()]).toEqual(["bot"])
  expect([...results(group([condition("isTeamsOwned", "false")])).keys()]).toEqual(["tab"])
  expect(results(group([condition("isCoreApp", "false")])).size).toBe(0)
  expect([...results(group([condition("@entitlementState", "Installed")])).get("bot").keys()]).toEqual(["general"])
  expect(results(group([condition("@capability", "bots"), condition("@entitlementState", "Featured")])).size).toBe(0)
  expect([...results(group([condition("@entitlementState", "Featured")]), "ring0").keys()]).toEqual(["bot"])
})

test("capability query seeds are equivalent to existing presets, including bot-only and negative checks", () => {
  for (const preset of presetQueries) {
    for (const ring of ["all", "general", "ring0"]) {
      expect(results(queryForPreset(preset.id), ring)).toEqual(filterPresetDefinitions(definitions, preset.id, ring))
    }
  }
  expect([...results(group([condition("@capability", "bots", "notEquals")])).keys()]).toEqual(["bot", "tab"])
})

test("SPFx matches site-domain placeholders in tab and task URLs without adding a default tile", () => {
  expect(presetQueries.find(({ id }) => id === "spfx").hidden).toBe(true)
  expect(defaultPresetQueries).toHaveLength(6)
  expect(defaultPresetQueries.some(({ id }) => id === "spfx")).toBe(false)
  const fixtures = spfxUrlPaths.flatMap((path, index) => ["{teamSiteDomain}", "{mySiteDomain}", "{MYSITEDOMAIN}"].map((token, variant) => {
    const app = { id: `spfx-${index}-${variant}` }
    let target = app
    for (const key of path.slice(0, -1)) {
      target[key] = ["commands", path[0]].includes(key) ? [{}] : {}
      target = Array.isArray(target[key]) ? target[key][0] : target[key]
    }
    target[path.at(-1)] = `https://${token}/_layouts/15/TeamsLogon.aspx?SPFX=true`
    return app
  }))
  fixtures.push(
    { id: "object-tab", staticTabs: { contentUrl: "https://{teamSiteDomain}" } },
    { id: "nested-tabs", staticTabs: [[{ contentUrl: "https://{mySiteDomain}" }]] },
    { id: "array-url", staticTabs: [{ contentUrl: ["https://{teamSiteDomain}"] }] },
  )
  const negatives = [
    { id: "normal", staticTabs: [{ contentUrl: "https://example.test/app" }] },
    { id: "domain-only", validDomains: ["{teamSiteDomain}"], webApplicationInfo: { resource: "https://{teamSiteDomain}" } },
    { id: "website-only", staticTabs: [{ websiteUrl: "https://{mySiteDomain}" }] },
    { id: "description-only", description: "{teamSiteDomain}", contentUrl: "https://{teamSiteDomain}" },
    { id: "malformed", staticTabs: [null, {}, { contentUrl: 42 }, { contentUrl: { text: "{teamSiteDomain}" } }] },
    { id: "sharepoint-not-spfx", staticTabs: [{ contentUrl: "https://tenant.sharepoint.com/sites/home" }] },
  ]
  const catalog = new Map([...fixtures, ...negatives].map((app) => [app.id, new Map([
    ["general", app], ["ring0", { id: app.id, staticTabs: [{ contentUrl: "https://example.test" }] }],
  ])]))
  const schema = buildAppDefinitionSchema(catalog)
  const query = queryForPreset("spfx", schema)
  expect(validateQuery(query, true, schema)).toBe("")
  expect(JSON.stringify(query)).not.toContain("@capability")
  expect(describeQuery(query, schema)).toContain("contentUrl contains")
  for (const audience of ["all", "general", "ring0", "missing-ring"]) {
    const actual = filterQueryDefinitions(catalog, new Map(), query, audience, schema)
    expect(actual).toEqual(filterPresetDefinitions(catalog, "spfx", audience))
    expect([...actual.keys()]).toEqual(["all", "general"].includes(audience) ? fixtures.map(({ id }) => id) : [])
    for (const variants of actual.values()) expect([...variants.keys()]).toEqual(["general"])
  }
  expect(filterQueryDefinitions(new Map(), new Map(), queryForPreset("spfx")).size).toBe(0)
})

test("invalid fields, operators and values cannot run, and previews show explicit grouping", () => {
  for (const invalid of [
    createCondition(),
    { ...condition("name", "test"), field: "unknown" },
    { ...condition("name", "test"), operator: "unknown" },
    condition("@capability", "unknown"),
    condition("isCoreApp", "unknown"),
    condition("name", " "),
    { ...createGroup(), match: "invalid" },
  ]) {
    const query = invalid.type === "group" ? invalid : group([invalid])
    expect(validateQuery(query)).not.toBe("")
    expect(() => results(query)).toThrow()
  }
  const query = group([condition("name", "Helper"), group([
    condition("@capability", "bots"), condition("@capability", "tabs"),
  ], "any")])
  expect(describeQuery(query)).toBe('name is "Helper" AND (Capability (derived) is "Bots" OR Capability (derived) is "Tabs")')
  expect(describeQuery(createGroup())).toBe("All apps")
  expect(canUseSimple(group([condition("name", "Helper")]))).toBe(true)
  expect(canUseSimple(query)).toBe(false)
  expect(canUseSimple(group([], "any"))).toBe(false)
})

test("schema combines known optional shapes with every observed property and preserves literal paths and types", () => {
  const value = {
    id: "typed", audienceGroup: "general", amsSellerAccountId: 42,
    configuration: { enabled: false, retries: 3, services: [{ endpoint: "service", options: { timeout: 0 } }] },
    "a.b": { "quote\"/[]": "literal" },
    mixed: "text", nullable: null,
  }
  const catalog = new Map([["typed", new Map([["general", value], ["ring0", { ...value, mixed: 7 }]])]])
  const schema = buildAppDefinitionSchema(catalog)
  expect(schema.properties.has("audienceGroup")).toBe(false)
  expect(propertyAt(schema, "webApplicationInfo").properties.has("resource")).toBe(true)
  expect(propertyAt(schema, "bots").items.properties.has("supportsFiles")).toBe(true)
  expect([...propertyAt(schema, "mixed").types].sort()).toEqual(["number", "string"])
  expect(propertyAt(appDefinitionSchema, "configuration")).toBeUndefined()
  const query = group([{
    ...createCondition("a.b", "literal", schema, ['quote"/[]']), operator: "equals",
  }])
  expect(filterQueryDefinitions(catalog, new Map(), query, "all", schema).size).toBe(1)
  const refreshedSchema = buildAppDefinitionSchema(new Map(), schema)
  expect(propertyAt(refreshedSchema, "configuration").properties.has("services")).toBe(true)
})

test("object subproperties and numbers are compared by their declared types without coercion", () => {
  const catalog = new Map([
    ["a", new Map([["general", { id: "a", webApplicationInfo: { id: "client-a", resource: "api://one" }, amsSellerAccountId: 12 }]])],
    ["b", new Map([["general", { id: "b", webApplicationInfo: {}, amsSellerAccountId: 3 }]])],
    ["c", new Map([["general", { id: "c" }]])],
  ])
  const schema = buildAppDefinitionSchema(catalog)
  const run = (clause) => [...filterQueryDefinitions(catalog, new Map(), group([clause]), "all", schema).keys()]
  expect(run({ ...createCondition("webApplicationInfo", "CLIENT-A", schema, ["id"]), operator: "equals" })).toEqual(["a"])
  expect(run({ ...createCondition("webApplicationInfo", "", schema), operator: "notEmpty" })).toEqual(["a"])
  expect(run({ ...createCondition("webApplicationInfo", "", schema), operator: "missing" })).toEqual(["c"])
  expect(run({ ...createCondition("amsSellerAccountId", "10", schema), operator: "greaterThan" })).toEqual(["a"])
  expect(run({ ...createCondition("amsSellerAccountId", "10", schema), operator: "lessThan" })).toEqual(["b"])
  expect(validateQuery(group([{ ...createCondition("amsSellerAccountId"), operator: "contains", value: "1" }]))).toContain("operator")
})

test("array counts, scoped Any/All rules and nested primitive arrays stay on the same item and variant", () => {
  const catalog = new Map([
    ["split", new Map([["general", { bots: [
      { id: "wanted", supportsFiles: false, scopes: ["personal"] },
      { id: "other", supportsFiles: true, scopes: ["team"] },
    ] }]])],
    ["match", new Map([
      ["general", { bots: [{ id: "wanted", supportsFiles: true, scopes: ["personal", "team"] }] }],
      ["ring0", { bots: [{ id: "preview", supportsFiles: false, scopes: ["personal"] }] }],
    ])],
    ["empty", new Map([["general", { bots: [] }]])],
    ["missing", new Map([["general", {}]])],
  ])
  const schema = buildAppDefinitionSchema(catalog)
  const itemSchema = propertyAt(schema, "bots").items
  const rule = createCondition("bots", "0", schema)
  const id = { ...createCondition("id", "wanted", itemSchema), operator: "equals" }
  const flag = createCondition("supportsFiles", "true", itemSchema)
  rule.items = group([id, flag])
  const run = (clause) => filterQueryDefinitions(catalog, new Map(), group([clause]), "all", schema)
  expect([...run(rule).keys()]).toEqual(["match"])
  expect([...run(rule).get("match").keys()]).toEqual(["general"])
  expect([...run({ ...rule, items: group([flag]), quantifier: "all" }).keys()]).toEqual(["match"])
  expect([...run({ ...rule, items: group([flag]), quantifier: "any" }).keys()]).toEqual(["split", "match"])
  expect([...run({ ...createCondition("bots", "0", schema), operator: "equals" }).keys()]).toEqual(["empty", "missing"])
  expect([...run({ ...createCondition("bots", "2", schema), operator: "greaterOrEqual" }).keys()]).toEqual(["split"])
  const scopes = createCondition("scopes", "0", itemSchema)
  scopes.items = group([{ ...createCondition("$value", "team", propertyAt(itemSchema, "scopes").items), operator: "equals" }])
  expect([...run({ ...rule, items: group([id, scopes]) }).keys()]).toEqual(["match"])
  expect(validateQuery(group([{ ...rule, value: "-1" }]), true, schema)).toContain("non-negative whole")
  expect(validateQuery(group([{ ...rule, value: "1.5" }]), true, schema)).toContain("non-negative whole")
  expect(validateQuery(group([{ ...rule, value: "0", operator: "equals" }]), true, schema)).toContain("cannot match any items")
  expect(validateQuery(group([{ ...rule, quantifier: "invalid" }]), true, schema)).toContain("Any or All")
  const invalidInner = { ...rule, items: group([condition("@capability", "bots")]) }
  expect(validateQuery(group([invalidInner]), true, schema)).toContain("supported app-definition property")
  expect(describeQuery(group([rule]), schema)).toContain('ANY bots item matches (id is "wanted" AND supportsFiles is "Yes")')
})

test("property-based preset conditions agree with capability detection on the sample catalog and mixed shapes", () => {
  const sample = JSON.parse(readFileSync(new URL("../samples/store_global_0.json", import.meta.url), "utf8")).value.appDefinitions
  const malformed = [
    { id: "empty", bots: [null, {}, [], false], customBots: false },
    { id: "nested", bots: [[{ id: "bot" }]] },
    { id: "object", bots: { id: "bot" } },
    { id: "extra", bots: [{ id: "bot" }], graphConnector: { id: "connector" } },
  ]
  const catalog = new Map([...sample, ...malformed].map((app) => [app.id, new Map([["general", app]])]))
  const schema = buildAppDefinitionSchema(catalog)
  for (const preset of presetQueries) {
    const query = queryForPreset(preset.id, schema)
    expect(validateQuery(query, true, schema)).toBe("")
    expect(filterQueryDefinitions(catalog, new Map(), query, "all", schema)).toEqual(filterPresetDefinitions(catalog, preset.id))
    expect(JSON.stringify(query)).not.toContain("@capability")
  }
})
