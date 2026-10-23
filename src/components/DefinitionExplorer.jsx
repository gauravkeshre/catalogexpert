import { useMemo, useState } from "react"
import { IconBraces, IconBrackets, IconChevronRight, IconSearch } from "@tabler/icons-react"
import { faQuoteLeft } from "@fortawesome/free-solid-svg-icons/faQuoteLeft"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { groupDefinitionNodes } from "@/lib/definition-groups"

function describe(value, key, path) {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value
  const folder = type === "object" || type === "array"
  const children = folder
    ? Object.entries(value).map(([childKey, childValue]) => describe(
        childValue,
        type === "array" ? `[${childKey}]` : childKey,
        `${path}[${type === "array" ? childKey : JSON.stringify(childKey)}]`,
      ))
    : []
  const text = folder ? "" : type === "string" ? (value === "" ? '""' : value) : String(value)
  return { key, path, type, folder, children, text }
}

function matchingNodes(nodes, query) {
  return nodes.flatMap((node) => {
    const children = matchingNodes(node.children, query)
    const matches = [node.key, node.path, node.folder ? "" : node.text]
      .some((part) => part.toLowerCase().includes(query))
    return matches ? [node] : children.length ? [{ ...node, children, totalChildren: node.children.length }] : []
  })
}

function FolderBadge({ node }) {
  return (
    <span className="shrink-0 border bg-background px-1.5 py-0.5 font-sans text-[10px] font-normal text-muted-foreground">
      {node.type}
    </span>
  )
}

function DirectoryNode({ node, expanded, onToggle }) {
  const isOpen = expanded(node.path)
  if (!node.folder) {
    return (
      <li data-definition-path={node.path} className="min-w-0 border-b border-border/50 last:border-b-0">
        <div className="flex min-w-0 items-start gap-2 px-2 py-2.5">
          <svg aria-hidden="true" focusable="false" data-icon={faQuoteLeft.iconName}
            viewBox={`0 0 ${faQuoteLeft.icon[0]} ${faQuoteLeft.icon[1]}`} fill="currentColor"
            className="mt-0.5 size-3 shrink-0 text-primary">
            <path d={faQuoteLeft.icon[4]} />
          </svg>
          <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-3">
            <span title={node.path} className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{node.key === "" ? '""' : node.key}</span>
            <span className="min-w-0 whitespace-pre-wrap font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{node.text}</span>
          </div>
          <FolderBadge node={node} />
        </div>
      </li>
    )
  }
  const ContainerIcon = node.type === "array" ? IconBrackets : IconBraces
  const count = node.totalChildren ?? node.children.length
  return (
    <li data-definition-path={node.path} className="min-w-0 border-b border-border/50 last:border-b-0">
      <details open={isOpen} className="min-w-0">
        <summary
          title={node.path}
          onClick={(event) => { event.preventDefault(); onToggle(node.path) }}
          className="flex min-w-0 cursor-pointer list-none items-start gap-2 px-2 py-2.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
        >
          <IconChevronRight aria-hidden="true" className={`mt-0.5 size-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          <ContainerIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 font-mono text-xs font-medium [overflow-wrap:anywhere]">{node.key === "" ? '""' : node.key}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{count} {node.type === "array" ? (count === 1 ? "item" : "items") : (count === 1 ? "property" : "properties")}</span>
          <FolderBadge node={node} />
        </summary>
        {node.children.length ? (
          <ul className="ml-2 min-w-0 border-l pl-2 sm:ml-3 sm:pl-3">
            {node.children.map((child) => <DirectoryNode key={child.path} node={child} expanded={expanded} onToggle={onToggle} />)}
          </ul>
        ) : <p className="px-7 pb-3 text-xs italic text-muted-foreground">Empty {node.type}</p>}
      </details>
    </li>
  )
}

export default function DefinitionExplorer({ value }) {
  const [search, setSearch] = useState("")
  const [openPaths, setOpenPaths] = useState(new Set())
  const [closedMatches, setClosedMatches] = useState(new Set())
  const root = useMemo(() => describe(value, "$", "$"), [value])
  const nodes = root.folder ? root.children : [root]
  const query = search.trim().toLowerCase()
  const visible = query ? matchingNodes(nodes, query) : nodes
  const groups = groupDefinitionNodes(visible)
  const folderPaths = []
  function collectFolders(children) {
    children.forEach((node) => {
      if (node.folder) folderPaths.push(node.path)
      collectFolders(node.children)
    })
  }
  collectFolders(nodes)
  const expanded = (path) => query ? !closedMatches.has(path) : openPaths.has(path)
  function toggle(path) {
    const setter = query ? setClosedMatches : setOpenPaths
    setter((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  function updateSearch(next) {
    setSearch(next)
    setClosedMatches(new Set())
  }
  return (
    <section aria-label="Definition directory" className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-48 grow">
          <IconSearch aria-hidden="true" className="pointer-events-none absolute top-3 left-2 size-4 text-muted-foreground" />
          <Input
            aria-label="Search definition"
            placeholder="Search keys, values, or paths…"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            className="pl-8"
          />
        </div>
        {search && <Button variant="ghost" size="xs" onClick={() => updateSearch("")}>Clear search</Button>}
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="xs" disabled={!folderPaths.length} onClick={() => { setOpenPaths(new Set(folderPaths)); setClosedMatches(new Set()) }}>Expand all</Button>
          <Button variant="outline" size="xs" disabled={!folderPaths.length} onClick={() => { setOpenPaths(new Set()); setClosedMatches(new Set(folderPaths)) }}>Collapse all</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Browse keys and values. Expand an object or array to see its nested properties.</p>
      <div className="min-w-0 space-y-4">
        {visible.length ? (
          groups.map(([label, children]) => (
            <section key={label} aria-label={label} className="min-w-0 border bg-muted/10">
              <h3 className="border-b border-l-2 border-l-primary bg-muted/50 px-3 py-2.5 text-sm font-semibold">{label}</h3>
              <ul className="min-w-0 p-1">
                {children.map((node) => <DirectoryNode key={node.path} node={node} expanded={expanded} onToggle={toggle} />)}
              </ul>
            </section>
          ))
        ) : <p role="status" className="border bg-muted/10 px-3 py-8 text-center text-sm text-muted-foreground">{query ? "No matching properties." : `Empty ${root.type}.`}</p>}
      </div>
    </section>
  )
}
