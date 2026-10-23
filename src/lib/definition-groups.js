const propertyGroups = [
  ["Version Information", ["version", "audienceGroup", "sourceType"]],
  ["Core App Properties", [
    "id", "manifestVersion", "name", "description", "shortDescription", "longDescription",
    "permissions", "etag", "officeAssetId", "externalId", "supportedPlatforms",
    "smallImageUrl", "largeImageUrl", "accentColor", "screenshotUrls", "videoUrl",
    "categories", "disabledScopes",
  ]],
  ["Developer Information", [
    "developerName", "developerUrl", "privacyUrl", "termsOfUseUrl", "thirdPartyNoticesUrl",
  ]],
  ["Security & Permissions", [
    "validDomains", "devicePermissions", "authorization", "webApplicationInfo",
    "securityComplianceInfo", "sensitivityLabel",
  ]],
  ["App Capabilities", [
    "bots", "customBots", "galleryTabs", "staticTabs", "inputExtensions", "connectors",
    "mobileModules", "hostedCapabilities", "meetingExtensionDefinition", "extensionItems",
    "dashboardCards", "plugins", "copilotGpts", "customEngineCopilots", "copilotActions",
  ]],
  ["Display & UI", [
    "isFullScreen", "showLoadingIndicator", "color32x32ImageUrl", "abbreviatedName",
    "backgroundLoadConfiguration",
  ]],
  ["Tenant & Identity", [
    "tenantId", "creatorId", "restrictedTenantTypes", "supportedTenantRegions",
  ]],
  ["Localization", ["supportedLanguages", "languageTag"]],
  ["Business & Marketplace", [
    "subscriptionOffer", "freePlanItem", "appCatalogExtension", "storeExtensionAttributes",
    "mpnId", "templatedAppId", "industries", "keywords", "publisherDocsUrl",
  ]],
  ["Configuration", [
    "configuration", "configurableProperties", "defaultInstallScope", "defaultGroupCapability",
    "scopeConstraints", "supportedChannelTypes", "supportedHubs", "supportsChannelFeatures",
  ]],
  ["Status & Metadata", [
    "deletedDateTimeUtc", "lastUpdatedAt", "appAvailabilityStatus", "publishingPolicy",
    "appPackageInfo", "elementRelationshipSet", "apiDependencies", "appMetadata",
  ]],
  ["Office Add-ins", [
    "officeAddInElementItem", "exchangeAddInElementItem", "supportedElementTypes",
  ]],
  ["App Enhancement Features", [
    "isFullTrust", "isTenantConfigurable", "applicableLicenseCategories", "validTrouterPaths",
    "activities", "graphConnector", "sharedAppResource", "intuneInfo", "contactInfo",
    "blockedConfigurations",
  ]],
  ["MetaOS Features", ["isMetaOSApp", "titleId", "manifestId"]],
  ["Copilot & AI Features", ["copilotEnabled", "isCopilotPluginSupported"]],
  ["Security & Compliance", [
    "isCoreApp", "isPinnable", "isBlockable", "isPreinstallable", "isTeamsOwned",
    "defaultBlockUntilAdminAction", "isAppIOSAcquirable", "requiredServicePlanIdSets",
    "isUninstallable",
  ]],
]

const groupByKey = new Map(propertyGroups.flatMap(([label, keys]) => keys.map((key) => [key, label])))

export function groupDefinitionNodes(nodes) {
  const groups = new Map([...propertyGroups.map(([label]) => [label, []]), ["Other Properties", []]])
  for (const node of nodes) {
    groups.get(groupByKey.get(node.key) ?? "Other Properties").push(node)
  }
  return [...groups].filter(([, children]) => children.length)
}
