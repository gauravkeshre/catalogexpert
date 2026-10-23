import { useEffect, useRef, useState } from "react"
import { IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

function CopyAction({ value, label, iconOnly }) {
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const request = useRef(0)

  useEffect(() => () => { request.current += 1 }, [])

  async function copy() {
    const current = ++request.current
    setFailed(false)
    setMessage(`Copying ${label}…`)
    if (typeof navigator.clipboard?.writeText !== "function") {
      setFailed(true)
      setMessage(`Clipboard access is unavailable. Copy ${label} manually.`)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      if (request.current === current) setMessage(`${label} copied.`)
    } catch {
      if (request.current === current) {
        setFailed(true)
        setMessage(`Could not copy ${label}. Try again.`)
      }
    }
  }

  return (
    <div className="flex max-w-full flex-col items-end gap-1">
      <Button type="button" variant="outline" size={iconOnly ? "icon-sm" : "sm"}
        aria-label={`Copy ${label}`} title={`Copy ${label}`} onClick={copy}>
        <IconCopy aria-hidden="true" />
        {!iconOnly && `Copy ${label}`}
      </Button>
      <span role="status" aria-live="polite" aria-atomic="true"
        className={`text-right text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>{message}</span>
    </div>
  )
}

export default function CopyButton({ value, label, iconOnly = false }) {
  return <CopyAction key={value} value={value} label={label} iconOnly={iconOnly} />
}
