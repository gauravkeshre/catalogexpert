function node(type) {
  return { types: new Set(type ? [type] : []), properties: new Map(), items: null }
}

function object(properties) {
  return { ...node("object"), properties: new Map(Object.entries(properties)) }
}

function array(items) {
  return { ...node("array"), items }
}

const string = () => node("string")
const boolean = () => node("boolean")
const strings = () => array(string())
const command = () => object({ title: string(), description: string() })
const bot = () => object({
  id: string(), botId: string(), scopes: strings(), isNotificationOnly: boolean(),
  supportsCalling: boolean(), supportsFiles: boolean(), supportsVideo: boolean(),
  allowBotMessageDeleteByUser: boolean(),
  commandLists: array(object({ scopes: strings(), commands: array(command()) })),
  requirementSet: object({ hostMustSupportFunctionalities: strings() }),
})
const tab = () => object({
  entityId: string(), name: string(), contentUrl: string(), websiteUrl: string(),
  configurationUrl: string(), canUpdateConfiguration: boolean(),
  scopes: strings(), context: strings(), meetingSurfaces: strings(),
})
const extension = () => object({
  botId: string(), canUpdateConfiguration: boolean(), fetchCommands: boolean(), scopes: strings(),
  commands: array(object({
    id: string(), title: string(), description: string(), type: string(), context: strings(),
    taskInfo: object({ url: string() }),
    parameters: array(object({ name: string(), title: string(), description: string(), inputType: string() })),
  })),
})

// Known catalog shapes keep common optional fields available even when all loaded values are empty.
export const appDefinitionSchema = object({
  ...Object.fromEntries([
    "id", "name", "version", "manifestVersion", "description", "shortDescription", "longDescription",
    "developerName", "developerUrl", "privacyUrl", "termsOfUseUrl", "thirdPartyNoticesUrl",
    "officeAssetId", "externalId", "creatorId", "tenantId", "accentColor", "smallImageUrl",
    "largeImageUrl", "videoUrl", "lastUpdatedAt", "systemVersion", "mpnId", "publisherDocsUrl",
    "languageTag", "defaultInstallScope", "sourceType", "etag", "abbreviatedName",
  ].map((key) => [key, string()])),
  ...Object.fromEntries([
    "isCoreApp", "isTeamsOwned", "isPinnable", "isPreinstallable", "isBlockable", "isFullTrust",
    "isFullScreen", "isMetaOSApp", "isTenantConfigurable", "isAppIOSAcquirable", "isUninstallable",
    "defaultBlockUntilAdminAction", "showLoadingIndicator", "copilotEnabled", "isCopilotPluginSupported",
  ].map((key) => [key, boolean()])),
  ...Object.fromEntries([
    "categories", "industries", "permissions", "validDomains", "devicePermissions", "disabledScopes",
    "keywords", "screenshotUrls", "supportedLanguages", "supportedPlatforms", "supportedChannelTypes",
    "restrictedTenantTypes", "configurableProperties",
  ].map((key) => [key, strings()])),
  amsSellerAccountId: node("number"),
  webApplicationInfo: object({ id: string(), resource: string(), applicationPermissions: strings() }),
  bots: array(bot()), customBots: array(bot()),
  staticTabs: array(tab()), galleryTabs: array(tab()), configurableTabs: array(tab()),
  inputExtensions: array(extension()), composeExtensions: array(extension()),
  connectors: array(object({ connectorId: string(), configurationUrl: string(), scopes: strings() })),
  copilotGpts: array(object({ id: string(), fileUrl: string() })),
  customEngineCopilots: array(object({ id: string() })),
  copilotAgents: object({
    declarativeAgents: array(object({ id: string(), file: string() })),
    customEngineAgents: array(object({ id: string(), type: string() })),
  }),
  securityComplianceInfo: object({ status: string(), mcasId: string() }),
  subscriptionOffer: object({ offerId: string(), isEligibleForAzureBenefits: boolean() }),
  defaultGroupCapability: object({ groupchat: string(), meetings: string(), team: string() }),
  meetingExtensionDefinition: object({
    isAnonymousAccessAllowed: boolean(), supportsCustomShareToStage: boolean(), supportsStreaming: boolean(),
  }),
  authorization: object({ permissions: object({
    resourceSpecific: array(object({ name: string(), type: string() })),
  }) }),
  publishingPolicy: object({ isFlaggedForViolations: boolean(), releaseType: string() }),
})

function merge(target, source) {
  for (const type of source.types) target.types.add(type)
  for (const [key, property] of source.properties) {
    if (!target.properties.has(key)) target.properties.set(key, node())
    merge(target.properties.get(key), property)
  }
  if (source.items) {
    target.items ??= node()
    merge(target.items, source.items)
  }
}

function observe(schema, value, seen, root = false) {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value
  if (!["null", "array", "object", "string", "number", "boolean"].includes(type)) return
  schema.types.add(type)
  if (value === null || typeof value !== "object") return
  if (!seen.has(value)) seen.set(value, new WeakSet())
  if (seen.get(value).has(schema)) return
  seen.get(value).add(schema)
  if (type === "array") {
    schema.items ??= node()
    for (const item of value) observe(schema.items, item, seen)
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (root && key === "audienceGroup") continue
      if (!schema.properties.has(key)) schema.properties.set(key, node())
      observe(schema.properties.get(key), child, seen)
    }
  }
}

export function buildAppDefinitionSchema(definitions, knownSchema = appDefinitionSchema) {
  const schema = node()
  merge(schema, knownSchema)
  const seen = new WeakMap()
  for (const variants of definitions.values()) {
    for (const app of variants.values()) observe(schema, app, seen, true)
  }
  return schema
}

export function propertyAt(schema, field, path = []) {
  let property = field === "$value" ? schema : schema.properties.get(field)
  for (const key of path) property = property?.properties.get(key)
  return property
}

export function propertyTypes(property) {
  return [...(property?.types || [])].filter((type) => type !== "null")
}

export function propertyLabel(field, path = []) {
  return [field, ...path].reduce((label, key, index) => {
    if (key === "$value" && index === 0) return "item value"
    return /^[a-zA-Z_$][\w$]*$/.test(key) ? `${label}${index ? "." : ""}${key}` : `${label}[${JSON.stringify(key)}]`
  }, "")
}
