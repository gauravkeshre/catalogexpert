import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { Button } from "@/components/ui/button"
import "./index.css"

class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("The explorer could not render.", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="mx-auto max-w-lg space-y-4 p-8">
          <h1 className="text-xl font-semibold">Cannot display the explorer</h1>
          <p>Reload the page. If the error continues, check the browser console.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>)
