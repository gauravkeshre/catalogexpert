const databaseName = "catalog-explorer"
const storeName = "snapshots"
const snapshotKey = "latest"

function accessCache(mode, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error("Another tab blocked catalog storage."))
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (blocked) {
        database.close()
        return
      }
      try {
        const transaction = database.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const operation = mode === "readonly" ? store.get(snapshotKey) : store.put(value, snapshotKey)
        transaction.oncomplete = () => {
          database.close()
          resolve(operation.result)
        }
        transaction.onabort = () => {
          database.close()
          reject(transaction.error || new Error("Catalog storage transaction failed."))
        }
      } catch (error) {
        database.close()
        reject(error)
      }
    }
  })
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNestedMap(value) {
  return value instanceof Map && [...value].every(([key, entries]) =>
    typeof key === "string" && entries instanceof Map && entries.size > 0
    && [...entries].every(([entryKey, entry]) => typeof entryKey === "string" && isRecord(entry)),
  )
}

export async function readCatalogCache() {
  const saved = await accessCache("readonly")
  if (saved === undefined) return null
  if (!saved || saved.version !== 1
    || !isNestedMap(saved.definitions) || saved.definitions.size === 0
    || !isNestedMap(saved.entitlements)
    || !(saved.sources instanceof Map)
    || ![...saved.sources].every(([url, rings]) =>
      typeof url === "string" && rings instanceof Set && [...rings].every((ring) => typeof ring === "string"))
    || !(saved.capturedAt instanceof Date) || !Number.isFinite(saved.capturedAt.getTime())
    || typeof saved.warning !== "string") {
    throw new Error("The saved catalog is invalid or uses an unsupported format.")
  }
  const { definitions, entitlements, sources, capturedAt, warning } = saved
  return { definitions, entitlements, sources, capturedAt, warning }
}

export function writeCatalogCache({ definitions, entitlements, sources, capturedAt, warning }) {
  return accessCache("readwrite", { version: 1, definitions, entitlements, sources, capturedAt, warning })
}
