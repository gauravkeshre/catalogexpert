import { calculateStatistics } from "./statistics.js"

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: calculateStatistics(data) })
  } catch (error) {
    console.error("Cannot calculate catalog statistics.", error)
    self.postMessage({ error: "Cannot calculate statistics. Retry, or change the applied filters." })
  }
}
