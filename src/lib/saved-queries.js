import { useState } from "react"

const storageKey = "catalog-explorer.queries.v1"

function isQuery(node) {
  if (!node || typeof node !== "object" || typeof node.id !== "string") return false
  if (node.type === "group") {
    return ["all", "any", "none"].includes(node.match) && Array.isArray(node.children) && node.children.every(isQuery)
  }
  return node.type === "condition" && typeof node.field === "string"
    && typeof node.operator === "string" && typeof node.value === "string"
    && Array.isArray(node.propertyPath) && node.propertyPath.every((key) => typeof key === "string")
    && typeof node.valueType === "string"
    && (!node.items || (["any", "all"].includes(node.quantifier) && isQuery(node.items)))
}

function readQueries() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]")
    if (!Array.isArray(saved) || saved.some((entry) =>
      !entry || typeof entry.id !== "string" || typeof entry.name !== "string" || !entry.name.trim()
      || entry.query?.type !== "group" || !isQuery(entry.query))) {
      throw new Error("Invalid saved queries")
    }
    return { queries: saved, error: "" }
  } catch (error) {
    console.error("Cannot read saved queries.", error)
    return { queries: [], error: "Cannot read saved queries. Existing saved data has not been changed." }
  }
}

export function useSavedQueries() {
  const [state, setState] = useState(readQueries)

  function write(queries) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(queries))
      setState({ queries, error: "" })
      return true
    } catch (error) {
      console.error("Cannot save queries.", error)
      setState({ ...state, error: "Cannot save queries in this browser. Your current draft is still available." })
      return false
    }
  }

  function saveQuery(name, query) {
    const existing = state.queries.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    const entry = { id: existing?.id || crypto.randomUUID(), name, query }
    return write(existing ? state.queries.map((saved) => saved.id === existing.id ? entry : saved) : [...state.queries, entry])
  }

  function deleteQuery(id) {
    return write(state.queries.filter((entry) => entry.id !== id))
  }

  return { ...state, saveQuery, deleteQuery }
}
