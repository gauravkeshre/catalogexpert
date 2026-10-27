import { useEffect, useMemo, useState } from "react"

export function useStatistics({ enabled, definitions, entitlements, schema, query, audience, type, grouping }) {
  const [attempt, setAttempt] = useState(0)
  const [completed, setCompleted] = useState(null)
  const request = useMemo(() => ({
    enabled, attempt, definitions, entitlements, schema, query, audience, type, grouping,
  }), [enabled, attempt, definitions, entitlements, schema, query, audience, type, grouping])

  useEffect(() => {
    if (!enabled) return
    let worker
    let timer
    let cancelled = false
    function fail(error) {
      if (cancelled) return
      console.error("Cannot load statistics.", error)
      setCompleted({ request, error: "Cannot load statistics. Retry to calculate the current results." })
      worker?.terminate()
    }
    // Let navigation and the shimmer paint before cloning the catalog for the worker.
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        try {
          worker = new Worker(new URL("./statistics.worker.js", import.meta.url), { type: "module" })
          worker.onmessage = ({ data }) => {
            if (cancelled) return
            setCompleted({ request, ...data })
            worker.terminate()
          }
          worker.onerror = fail
          worker.onmessageerror = fail
          worker.postMessage(request)
        } catch (error) {
          fail(error)
        }
      }, 0)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [enabled, request])

  const current = enabled && completed?.request === request ? completed : null
  return {
    result: current?.result,
    error: current?.error,
    pending: enabled && !current,
    retry: () => setAttempt((value) => value + 1),
  }
}
