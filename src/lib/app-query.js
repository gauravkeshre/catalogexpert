import {
  capabilities, capabilityProperties, defaultPresetQueries, otherCapabilityProperties, presetQueries,
  spfxDomainTokens, spfxUrlPaths,
} from "./preset-queries.js"
import {
  appDefinitionSchema, buildAppDefinitionSchema, propertyAt, propertyLabel, propertyTypes,
} from "./app-definition-schema.js"

const equalityOperators = [{ id: "equals", label: "is" }, { id: "notEquals", label: "is not" }]
const emptyOperators = [{ id: "empty", label: "is empty" }, { id: "notEmpty", label: "is not empty" }]
const presenceOperators = [{ id: "exists", label: "is present" }, { id: "missing", label: "is missing" }]
const textOperators = [
  { id: "contains", label: "contains" }, ...equalityOperators,
  { id: "notContains", label: "does not contain" }, { id: "startsWith", label: "starts with" },
  ...emptyOperators, ...presenceOperators,
]
const numberOperators = [
  ...equalityOperators, { id: "greaterThan", label: ">" }, { id: "greaterOrEqual", label: ">=" },
  { id: "lessThan", label: "<" }, { id: "lessOrEqual", label: "<=" },
]
const booleanValues = [{ id: "true", title: "Yes" }, { id: "false", title: "No" }]
const derivedFields = [
  { id: "@capability", label: "Capability (derived)", values: defaultPresetQueries },
  { id: "@entitlementState", label: "Entitlement state (configured)" },
]

export function fieldsFor(schema = appDefinitionSchema, derived = schema === appDefinitionSchema) {
  const fields = [...schema.properties.keys()].sort().map((id) => ({ id, label: id }))
  if (!derived) fields.unshift({
    id: "$value", label: propertyTypes(schema).includes("object") ? "Item itself" : "Item value",
  })
  return derived ? [...fields, ...derivedFields] : fields
}

export function fieldFor(condition, schema = appDefinitionSchema) {
  const derived = derivedFields.find(({ id }) => id === condition.field)
  if (derived) return { ...derived, type: derived.values ? "choice" : "string" }
  const property = propertyAt(schema, condition.field, condition.propertyPath)
  if (!property) return null
  const type = condition.valueType || propertyTypes(property)[0] || "unknown"
  return {
    id: condition.field, label: propertyLabel(condition.field, condition.propertyPath), type, property,
    values: type === "boolean" ? booleanValues : undefined,
  }
}

export function operatorsFor(condition, schema = appDefinitionSchema) {
  const field = typeof condition === "string" ? fieldFor({ field: condition }, schema) : fieldFor(condition, schema)
  switch (field?.type) {
    case "choice": return equalityOperators
    case "boolean": return [...equalityOperators, ...presenceOperators]
    case "number": return [...numberOperators, ...presenceOperators]
    case "array": return numberOperators.map((operator) => ({ ...operator, label: `count ${operator.label}` }))
    case "object": return [...presenceOperators, ...emptyOperators]
    case "unknown": return presenceOperators
    default: return textOperators
  }
}

export function needsValue(operator) {
  return !["empty", "notEmpty", "exists", "missing"].includes(operator)
}

export function createGroup() {
  return { id: crypto.randomUUID(), type: "group", match: "all", children: [] }
}

export function createCondition(field = "name", value, schema = appDefinitionSchema, propertyPath = [], valueType) {
  const condition = { id: crypto.randomUUID(), type: "condition", field, propertyPath }
  const definition = fieldFor({ ...condition, valueType }, schema)
  if (!definition) throw new RangeError(`Unknown query field: ${field}`)
  condition.valueType = definition.type
  condition.operator = definition.type === "array" ? "greaterThan"
    : definition.type === "string" ? "contains"
    : ["object", "unknown"].includes(definition.type) ? "exists" : "equals"
  condition.value = value ?? definition.values?.[0].id ?? (["array", "number"].includes(definition.type) ? "0" : "")
  if (definition.type === "array") {
    condition.items = createGroup()
    condition.quantifier = "any"
  }
  return condition
}

export function defaultField(schema) {
  return schema.properties.has("name") ? "name" : schema.properties.has("id") ? "id" : fieldsFor(schema, false)[0]?.id
}

function definitionRule(field, path, schema) {
  const property = propertyAt(schema, field, path)
  const branches = []
  if (property?.types.has("object")) {
    branches.push({ ...createCondition(field, undefined, schema, path, "object"), operator: "notEmpty" })
  }
  if (property?.types.has("array")) {
    const clause = createCondition(field, "0", schema, path, "array")
    const itemRule = definitionRule("$value", [], property.items)
    if (itemRule) clause.items.children = [itemRule]
    else clause.operator = "lessThan"
    branches.push(clause)
  }
  return branches.length > 1 ? { ...createGroup(), match: "any", children: branches } : branches[0]
}

function spfxUrlRule(field, path, schema, propertyPath = []) {
  const property = propertyAt(schema, field, propertyPath)
  const branches = []
  if (property?.types.has("array")) {
    const item = path.length && !property.items.types.has("array")
      ? spfxUrlRule(path[0], path.slice(1), property.items)
      : spfxUrlRule("$value", path, property.items)
    if (item) {
      const clause = createCondition(field, "0", schema, propertyPath, "array")
      clause.items.children = [item]
      branches.push(clause)
    }
  }
  if (path.length && property?.types.has("object")) {
    const child = spfxUrlRule(field, path.slice(1), schema, [...propertyPath, path[0]])
    if (child) branches.push(child)
  }
  if (!path.length && property?.types.has("string")) {
    branches.push(...spfxDomainTokens.map((token) => createCondition(field, token, schema, propertyPath, "string")))
  }
  return branches.length > 1 ? { ...createGroup(), match: "any", children: branches } : branches[0]
}

export function queryForPreset(presetId, schema = appDefinitionSchema) {
  if (!presetQueries.some(({ id }) => id === presetId)) throw new RangeError(`Unknown preset query: ${presetId}`)
  if (presetId === "spfx") {
    const conditions = spfxUrlPaths.map(([field, ...path]) => spfxUrlRule(field, path, schema)).filter(Boolean)
    return { ...createGroup(), match: "any", children: conditions.length ? conditions
      : [{ ...createCondition("id", undefined, schema), operator: "missing" }] }
  }
  const paths = capabilityProperties[presetId === "botOnly" ? "bots" : presetId]
  const conditions = paths.map(([field, ...path]) => definitionRule(field, path, schema)).filter(Boolean)
  const matches = { ...createGroup(), match: "any", children: conditions.length ? conditions
    : [{ ...createCondition("id", undefined, schema), operator: "missing" }] }
  if (presetId !== "botOnly") return { ...createGroup(), children: [matches] }
  const excludedPaths = [
    ...Object.entries(capabilityProperties).filter(([id]) => id !== "bots").flatMap(([, values]) => values),
    ...otherCapabilityProperties.map((key) => [key]),
  ]
  const excluded = excludedPaths.map(([field, ...path]) => definitionRule(field, path, schema)).filter(Boolean)
  return { ...createGroup(), children: [matches, { ...createGroup(), match: "none", children: excluded }] }
}

export function canUseSimple(query) {
  return query.match === "all" && query.children.every((child) =>
    child.type === "condition" && (!child.items || canUseSimple(child.items)))
}

export function validateQuery(node, root = true, schema = appDefinitionSchema, derived = true) {
  if (node.type === "group") {
    if (!["all", "any", "none"].includes(node.match)) return "Choose whether the group matches all, any, or none of the conditions."
    if (!node.children.length && !root) return "An empty group needs a condition, or remove the group."
    for (const child of node.children) {
      const error = validateQuery(child, false, schema, derived)
      if (error) return error
    }
    return ""
  }
  const field = fieldFor(node, schema)
  if (node.type !== "condition" || !field || (!derived && node.field.startsWith("@"))) return "Choose a supported app-definition property."
  if (field.property && node.valueType && !propertyTypes(field.property).includes(node.valueType) && node.valueType !== "unknown") {
    return `Choose a supported type for ${field.label}.`
  }
  if (!operatorsFor(node, schema).some(({ id }) => id === node.operator)) return `Choose an operator for ${field.label}.`
  if (needsValue(node.operator) && (typeof node.value !== "string" || !node.value.trim())) return `Enter a value for ${field.label}.`
  if (["array", "number"].includes(field.type) && needsValue(node.operator)) {
    const number = Number(node.value)
    if (!Number.isFinite(number)) return `Enter a finite number for ${field.label}.`
    if (field.type === "array" && (!Number.isSafeInteger(number) || number < 0)) return `Enter a non-negative whole count for ${field.label}.`
  }
  if (field.values && needsValue(node.operator) && !field.values.some(({ id }) => id === node.value)) return `Choose a value for ${field.label}.`
  if (field.type === "array") {
    if (!["any", "all"].includes(node.quantifier)) return `Choose Any or All items for ${field.label}.`
    if (!node.items || node.items.type !== "group") return `Choose item conditions for ${field.label}.`
    if (node.items.children.length && !canMatchNonemptyArray(node)) return `The count for ${field.label} cannot match any items. Remove item conditions or change the count.`
    return validateQuery(node.items, true, field.property.items, false)
  }
  return ""
}

export function describeQuery(node, schema = appDefinitionSchema) {
  if (node.type === "group") {
    if (!node.children.length) return "All apps"
    const description = node.children.map((child) => {
      const description = describeQuery(child, schema)
      return child.type === "group" || child.items?.children.length ? `(${description})` : description
    }).join(node.match === "all" ? " AND " : " OR ")
    return node.match === "none" ? `NOT (${description})` : description
  }
  const field = fieldFor(node, schema)
  const operator = operatorsFor(node, schema).find(({ id }) => id === node.operator)
  const value = field?.values?.find(({ id }) => id === node.value)?.title ?? node.value
  const display = ["array", "number"].includes(field?.type) ? value : JSON.stringify(value || "[value]")
  const comparison = `${field?.label} ${operator?.label}${needsValue(node.operator) ? ` ${display}` : ""}`
  return node.items?.children.length
    ? `${comparison} AND ${node.quantifier.toUpperCase()} ${field.label} item matches (${describeQuery(node.items, field.property.items)})`
    : comparison
}

function compareNumber(actual, operator, expected) {
  switch (operator) {
    case "equals": return actual === expected
    case "notEquals": return actual !== expected
    case "greaterThan": return actual > expected
    case "greaterOrEqual": return actual >= expected
    case "lessThan": return actual < expected
    case "lessOrEqual": return actual <= expected
    default: throw new RangeError(`Unknown numeric operator: ${operator}`)
  }
}

export function canMatchNonemptyArray(condition) {
  const count = Number(condition.value)
  if (!condition.value.trim() || !Number.isSafeInteger(count) || count < 0) return false
  if (condition.operator === "equals") return count > 0
  if (condition.operator === "lessThan") return count > 1
  if (condition.operator === "lessOrEqual") return count > 0
  return true
}

function readProperty(condition, value) {
  if (condition.field !== "$value" && (value === null || typeof value !== "object" || Array.isArray(value))) return undefined
  let raw = condition.field === "$value" ? value : Object.hasOwn(value, condition.field) ? value[condition.field] : undefined
  for (const key of condition.propertyPath || []) {
    raw = raw !== null && typeof raw === "object" && !Array.isArray(raw) && Object.hasOwn(raw, key) ? raw[key] : undefined
  }
  return raw
}

function compareScalar(raw, condition, type) {
  const missing = raw === undefined || raw === null
  if (condition.operator === "exists") return !missing
  if (condition.operator === "missing") return missing
  const rawType = Array.isArray(raw) ? "array" : typeof raw
  if (!missing && rawType !== type) return false
  const empty = missing || (typeof raw === "string" && raw.trim() === "")
    || (type === "object" && Object.keys(raw).length === 0)
  if (condition.operator === "empty") return empty
  if (condition.operator === "notEmpty") return !empty
  if (missing) return ["notEquals", "notContains"].includes(condition.operator)
  if (type === "number") return compareNumber(raw, condition.operator, Number(condition.value))
  const actual = String(raw).toLowerCase()
  const expected = condition.value.trim().toLowerCase()
  switch (condition.operator) {
    case "equals": return actual === expected
    case "notEquals": return actual !== expected
    case "contains": return actual.includes(expected)
    case "notContains": return !actual.includes(expected)
    case "startsWith": return actual.startsWith(expected)
    default: throw new RangeError(`Unknown query operator: ${condition.operator}`)
  }
}

function matchesCondition(condition, value, context, schema) {
  if (condition.field === "@capability") {
    const present = capabilities(value)[condition.value]
    return condition.operator === "equals" ? present : !present
  }
  if (condition.field === "@entitlementState") {
    const states = [...(context.entitlements.get(context.appId) || [])]
      .filter(([key]) => key.split(".")[0] === context.ring)
      .map(([, entry]) => entry.state || "Unknown")
    if (["notEquals", "notContains", "empty", "missing"].includes(condition.operator)) {
      return states.length ? states.every((state) => compareScalar(state, condition, "string")) : true
    }
    return states.some((state) => compareScalar(state, condition, "string"))
  }
  const field = fieldFor(condition, schema)
  const raw = context.root && condition.field === "id" && !condition.propertyPath?.length
    ? context.appId : readProperty(condition, value)
  if (field.type !== "array") return compareScalar(raw, condition, field.type)
  if (raw !== undefined && raw !== null && !Array.isArray(raw)) return false
  const items = raw ?? []
  if (!compareNumber(items.length, condition.operator, Number(condition.value))) return false
  if (!condition.items.children.length) return true
  if (!items.length) return false
  const matches = (item) => matchesQuery(condition.items, item, { ...context, root: false }, field.property.items)
  return condition.quantifier === "all" ? items.every(matches) : items.some(matches)
}

function matchesQuery(node, value, context, schema) {
  if (node.type === "condition") return matchesCondition(node, value, context, schema)
  if (!node.children.length) return true
  const matches = (child) => matchesQuery(child, value, context, schema)
  return node.match === "all" ? node.children.every(matches)
    : node.match === "none" ? !node.children.some(matches) : node.children.some(matches)
}

export function filterQueryDefinitions(definitions, entitlements, query, audience = "all", schema = buildAppDefinitionSchema(definitions)) {
  const error = validateQuery(query, true, schema)
  if (error) throw new RangeError(error)
  const results = new Map()
  for (const [appId, variants] of definitions) {
    const matching = new Map([...variants].filter(([ring, app]) =>
      (audience === "all" || audience === ring) && matchesQuery(query, app, { appId, ring, entitlements, root: true }, schema)))
    if (matching.size) results.set(appId, matching)
  }
  return results
}
