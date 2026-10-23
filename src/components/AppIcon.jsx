import { useState } from "react"

function AppIcon({ app, compact = false }) {
  const [failed, setFailed] = useState(false)
  const imageUrl = compact ? app.smallImageUrl || app.largeImageUrl : app.largeImageUrl
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden border bg-muted font-semibold text-muted-foreground ${compact ? "size-6 text-xs" : "size-10"}`}>
      {imageUrl && !failed
        ? <img className="size-full object-contain" src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : (app.name || "?").charAt(0).toUpperCase()}
    </div>
  )
}

export default AppIcon
