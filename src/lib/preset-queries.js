function hasDefinition(value) {
  if (Array.isArray(value)) return value.some(hasDefinition)
  return value !== null && typeof value === "object" && Object.keys(value).length > 0
}

export const capabilityProperties = {
  customEngine: [["customEngineCopilots"], ["copilotAgents", "customEngineAgents"]],
  declarative: [["copilotGpts"], ["copilotAgents", "declarativeAgents"]],
  bots: [["bots"], ["customBots"]],
  tabs: [["staticTabs"], ["galleryTabs"], ["configurableTabs"]],
  messageExtensions: [["inputExtensions"], ["composeExtensions"]],
}
export const otherCapabilityProperties = [
    "connectors", "plugins", "extensions", "mobileModules", "hostedCapabilities",
    "meetingExtensionDefinition", "extensionItems", "dashboardCards", "copilotActions",
    "officeAddInElementItem", "exchangeAddInElementItem", "graphConnector",
]

export const spfxDomainTokens = ["{teamSiteDomain}", "{mySiteDomain}"]
export const spfxUrlPaths = [
  ...["staticTabs", "galleryTabs", "configurableTabs"].flatMap((field) =>
    ["contentUrl", "configurationUrl"].map((url) => [field, url])),
  ...["inputExtensions", "composeExtensions"].map((field) => [field, "commands", "taskInfo", "url"]),
]

function matchesSpfxUrl(value, path) {
  if (Array.isArray(value)) return value.some((item) => matchesSpfxUrl(item, path))
  if (path.length) {
    return value !== null && typeof value === "object"
      && matchesSpfxUrl(value[path[0]], path.slice(1))
  }
  return typeof value === "string" && spfxDomainTokens.some((token) => value.toLowerCase().includes(token.toLowerCase()))
}

function presetEvidence(app) {
  return { ...capabilities(app), spfx: spfxUrlPaths.some((path) => matchesSpfxUrl(app, path)) }
}

export function capabilities(app) {
  const evidence = Object.fromEntries(Object.entries(capabilityProperties).map(([id, paths]) => [
    id, paths.some((path) => hasDefinition(path.reduce((value, key) => value?.[key], app))),
  ]))
  const { customEngine, declarative, bots, tabs, messageExtensions } = evidence
  const other = otherCapabilityProperties.some((key) => hasDefinition(app[key]))
  return {
    customEngine,
    declarative,
    bots,
    tabs,
    messageExtensions,
    botOnly: bots && !tabs && !messageExtensions && !customEngine && !declarative && !other,
  }
}

export const presetQueries = [
  { id: "customEngine", title: "Custom Engine Agents", description: "Custom-engine agent definitions." },
  { id: "declarative", title: "Declarative Agents", description: "Declarative-agent definitions." },
  { id: "bots", title: "Bots", description: "Apps with bot definitions." },
  { id: "tabs", title: "Tabs", description: "Static or configurable tabs." },
  { id: "botOnly", title: "Bot Only Apps", description: "Bots with no other detected capability." },
  { id: "messageExtensions", title: "Message Extensions", description: "Apps with message extensions." },
  { id: "spfx", title: "SPFx Apps", description: "SharePoint-hosted apps using site-domain placeholders.", hidden: true },
]

export const defaultPresetQueries = presetQueries.filter(({ hidden }) => !hidden)

export function filterPresetDefinitions(definitions, presetId, audience = "all") {
  if (!presetQueries.some(({ id }) => id === presetId)) {
    throw new RangeError(`Unknown preset query: ${presetId}`)
  }
  const matches = new Map()
  for (const [appId, variants] of definitions) {
    const matchingVariants = new Map([...variants].filter(([ring, app]) =>
      (audience === "all" || audience === ring) && presetEvidence(app)[presetId]))
    if (matchingVariants.size) matches.set(appId, matchingVariants)
  }
  return matches
}

export function countPresetQueries(definitions, audience = "all") {
  const counts = Object.fromEntries(presetQueries.map(({ id }) => [id, 0]))
  for (const variants of definitions.values()) {
    const matches = new Set()
    for (const [ring, app] of variants) {
      if (audience !== "all" && audience !== ring) continue
      const evidence = presetEvidence(app)
      for (const { id } of presetQueries) {
        if (evidence[id]) matches.add(id)
      }
    }
    for (const id of matches) counts[id] += 1
  }
  return presetQueries.map((query) => ({ ...query, appCount: counts[query.id] }))
}
