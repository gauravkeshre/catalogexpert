# App Definitions Explorer

Search Microsoft Teams app definitions and inspect configured entitlements.

## Run

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open the local URL from Vite.
The explorer uses the local catalog cache when available.
The first load requires a network connection and permission from the remote server.
The explorer does not read local credentials or provide Microsoft sign-in.

## Interface

The interface uses React, Vite, Tailwind CSS, and shadcn preset `b3Sm9Q7NQ`.
It retains Sera's square corners, button typography, and underlined fields.
Lime controls use darker text, as requested.

The sidebar contains Advanced, Library, and Entitlement states.
Advanced is the query workspace, available without selecting a preset.
Settings and the Light / Dark / System controls sit at the bottom.
Narrow windows use a navigation drawer.

The library starts with six preset queries: Custom Engine Agents, Declarative Agents, Bots, Tabs, Bot Only Apps, and Message Extensions.
Each tile previews matching apps instead of emphasizing counts.
Desktop shows up to five app icons and names; mobile shows up to four compact app icons to retain square tiles.
Click an app preview to open its details directly without leaving Library.
Preview buttons have app-name tooltips and accessible labels, and return keyboard focus when details close.
Details contain only variants matching that tile's query and ring filter.
Tiles use the same result ordering as Advanced and show each app once, independently of Library text search.
The smaller View all action runs the query in Advanced; its count shows the total, not just the previewed apps.
Empty tiles say No matching apps; missing or failed images use an initial.
Descriptions remain available to screen readers and in the tile picker.
Use the pencil icon beside Preset queries to choose from all built-in presets and saved queries.
Choose Create query in the picker to build and save another query in Advanced.
Advanced and the picker use the same saved-query list.
Desktop and mobile selections are independent and saved in this browser.
Selection order sets tile order; uncheck and recheck a query to move it to the end.
Desktop keeps six configurable rectangular tiles in three columns and two rows.
Replace one selection before adding another tile.
The saved-query list can grow without adding dashboard slots.
Below 768 pixels, mobile shows up to four square tiles in two columns and two rows.
Mobile starts with the first four default presets and keeps descriptions available to screen readers.
Saved-query tiles run the current saved conditions, respect ring filters, and update their counts when the query changes.
Deleting a saved query replaces its desktop tile with an unused default.
Cancel leaves selections unchanged. Browser-storage failures show a notice.
Counts use detected capabilities and the current ring filter, not text search.
One app can match multiple queries.
Bot Only Apps includes variants where the explorer detects bots but no other supported capability.
Choose View all to show matching apps in Advanced.
The preset becomes editable conditions on actual definition properties and runs immediately.
Advanced shows the loaded conditions directly, without a starting-point banner; results appear below the editor.

SPFx Apps is an additional built-in preset, not pinned by default.
It matches `{teamSiteDomain}` or `{mySiteDomain}` case-insensitively in tab `contentUrl` / `configurationUrl` fields
and messaging-extension command `taskInfo.url` fields, including their catalog equivalents.
The generated query uses editable property conditions, not a new derived capability.
This is a URL-based heuristic: it does not certify SPFx packaging, and apps using hardcoded tenant URLs can be missed.
The SharePoint-hosted URL patterns follow [Microsoft's SPFx deployment guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/deployment-spfx-teams-solutions).

### Advanced queries

Advanced uses the same compact count-and-sync heading as Library, with Refresh beside it.
Its count reflects the applied query, not draft edits, and starts at zero before a query runs.

Simple mode combines condition rows with AND: every condition must match.
Advanced mode supports AND / OR at the query level and within nested groups.
Condition rows use inline field / operator / value controls, a Where / AND / OR gutter, and outlined nested filter groups.
The editor uses the Card, Select, Input, and Button components from shadcn preset `b3Sm9Q7NQ`.
It retains the preset's square corners, underline controls, focus styles, and button typography.
Desktop controls use the preset's 40px height. Mobile controls wrap onto two lines.
In Advanced, the connector dropdown beside the second rule changes the logic for the entire group.
For fewer than two rules, the same control appears above the rules.
Add filter adds a condition. Add nested filter creates a separate logical group.
Clear group removes only that group's rules, not its siblings or the applied results.
Use "All (AND)" for every condition, "Any (OR)" for alternatives, or "None (NOT)" to exclude a group.
For example, combine developerName is Microsoft with a group matching bot or tab property conditions.
The live query preview shows parentheses explicitly.
Both modes edit the same query.
Simple mode is unavailable while the query contains OR or nested groups, so switching modes cannot silently change its meaning.

Property selectors show actual app-definition keys, such as id, developerName, and webApplicationInfo.
Known catalog shapes keep common optional properties available; loaded definitions supply additional properties, nesting, and observed types.
Known shapes stay available across catalog refreshes in this session.
Operators adapt to strings, numbers, booleans, objects, and arrays.
For mixed-type properties, choose which observed type to query.
Object properties expose further selectors, such as webApplicationInfo.id or webApplicationInfo.resource.
Computed capability and configured entitlement-state shortcuts are explicitly labelled; they are not manifest keys.
Text matching is case-insensitive and literal; text values do not interpret wildcards or AND / OR.
Version fields use text comparisons, not semantic-version ordering.
Numbers support equality, inequality, and ordering.
Arrays default to a numeric count condition; missing or null arrays have count zero.
Counts must be non-negative whole numbers.
When a count can match non-empty arrays, item conditions become available.
Choose Any item or All items, and combine rules against the same item.
All items with item conditions requires a non-empty array; empty arrays do not pass vacuously.
Nested item arrays support their own counts and item rules.
Primitive arrays, such as scopes or categories, expose Item value.
Object arrays expose their actual keys and Item itself for object-presence checks.
Count conditions that cannot match any items cannot run with active item rules; those rules remain visible until removed.
Boolean No requires an explicit false, not an absent property.
Objects support presence and empty-object checks.
Missing fields match negative operators and "is empty".
All conditions must match within the same app variant.
Entitlement-state conditions use entitlements from that variant's ring.
Apps are counted once, and Advanced details include only matching variants.
The optional ring filter limits Advanced results as it does Library results.

Choose Run query to apply the current conditions.
An empty query returns all apps.
Blank values and empty nested groups cannot run.
Edits retain the previous results with an "Unapplied changes" notice and a separate applied-query summary until you run again.
Clear query resets the draft, not the previous results.
Queries and drafts survive page navigation independently of the Library search.
Unsaved drafts do not survive reloads.
Ring changes and catalog refreshes re-evaluate the applied query automatically.
Results retain Grid / List views, pagination, and app details.
The editor and results stay on one page.
Filter surfaces and controls retain the installed shadcn preset's square corners without local radius overrides.

The rightmost Presets tab contains all six built-in queries with their property conditions.
Loading a preset from this tab changes the draft without running it.
Tune its conditions, then choose Run query.
Bot Only Apps uses a None group to exclude other capabilities.
Built-in query conditions use the same capability property mapping as the Library tiles.

Save query sits at the card's bottom-right.
Choose a name to persist the conditions in this browser and retrieve them from Saved queries in the Presets tab.
Saving an existing name replaces its conditions after a visible warning in the save dialog.
Saved queries can be deleted from the tab.
Saves do not include catalog data, ring selections, or display preferences.
Storage failures retain the draft and show an error rather than reporting success.

Every Export results button opens a chooser before downloading.
Choose Full dump, or Selected fields with any combination of App Name, App ID, and Developer.
All exports include every matching app, not just the current page.
Full dump writes catalog-results.json with the applied query, selected audience, unique app count, and matching definition variants.
Selected fields writes catalog-results-fields.json as one JSON entry per unique app, containing only the selected name, id, and/or developerName keys.
Field-only exports contain no query metadata or raw definitions; unavailable names or developers are null.
Names and developers come from the displayed matching variant, respecting the current ring filter.
At least one field must be selected; Cancel closes the chooser without downloading.
Unapplied draft edits are not exported.
The Library also exports its complete current result set.
Raw definitions retain source properties and ring information regardless of display preferences.
Empty result sets disable export; download failures show an error.

**TODO: Prompt to query.** Its dedicated tab is a placeholder for turning natural-language prompts into editable conditions.
It does not call an AI service or generate queries.

Use Grid view for app cards or List view for the table.
Cards show the app icon, name, and developer.
Both views retain pagination and app details.
The view choice stays in browser storage.

The library shows 25 apps per page.
Search supports app names, IDs, developers, Office asset IDs, versions, descriptions, wildcards, AND, and OR.
App details contain Summary, Versions, Entitlements, Definition, Technical, and JSON tabs.
Click anywhere on an app row to open its details, or use the app name or arrow button with the keyboard.
The summary provides an App ID copy button and badges for app capabilities, including Teams ownership.
The JSON tab displays and copies the selected variant without muted properties.
Copy actions report success or clipboard access errors.
The Definition tab presents nested key-value pairs with quote-left icons for values, braces for objects, and brackets for arrays.
Version Information appears first, followed by Core App Properties.
Other Properties retains fields without a named group.
Groups show only available fields, with each property shown once.
Groups start expanded. Click a group heading to collapse it, or use Enter or Space.
Ring preferences also apply to Definition fields.
Quote-left uses Font Awesome Free Solid; the Pro Duotone style is not bundled.
Objects and arrays expand to reveal typed child properties.
Search keys, values, or paths to reveal matching fields and their ancestors, or use the expand and collapse controls to browse.
Definition search covers all groups and hides groups without matching fields.
Search opens matching groups. Clear search restores previous group states and returns focus to the search field.
Expand all and Collapse all control groups and nested objects.
The entitlement page provides state groups and a state reference.
Enable statistics to show a compact strip of totals and inspect loaded source URLs.

Settings control ring information, statistics, descriptions, identifiers, and entitlement summaries.
Ring information is off by default.
Hidden rings do not restrict results.
Under App detail properties, search property names or groups and select properties to mute.
Selections hide exact top-level keys and their nested values across detail tabs, variant labels, JSON, and copied JSON.
Muting does not change Library results, queries, exports, or cached catalog data.
Muting is a display preference, not a security control.
Restore all properties clears muting. Reset display settings also clears muting.
Other display settings do not remove source fields from JSON.
Settings stay in browser storage.
Storage failures show a notice.

Catalog data stays in IndexedDB in this browser.
Reloads use the saved data without requesting catalog configurations, definitions, or entitlements.
The Library heading is one line: "Showing X of Y apps, synced on <DateTime>", with Refresh beside it.
X counts apps matching the current search and ring filter; Y counts all loaded apps.
Pagination stays at 25 apps per page.
Hover over the summary to see whether data came from the live catalog or local cache.
The cache does not expire automatically.
Keep the same browser profile and local URL, including the port, to reuse it.
For local testing, load the catalog once, then reload without refreshing.
App images can still require network access.

Refresh requests a new catalog and replaces the saved data after a successful load.
Failed refreshes retain the previous data.
Partial loads retain their warning in the cache.
Cache failures show a notice.
If browser storage is unavailable or cleared, the next reload requests catalog data again.

## Check

```sh
npm run lint
npm run build
npx playwright install chromium
npm test
```

Browser tests use synthetic catalog responses.
They check production output without sending requests to Microsoft.
They do not prove live service availability.

## Publish

`npm run build` writes production files to `docs/`.
The relative asset paths support deployment under a repository subpath.

```sh
npm run preview
```

On macOS, run:

```sh
./start-server.sh
./start-server.sh --no-build --port 3000
```

The launcher builds production files and opens `http://127.0.0.1:8080`.
Use `--no-build` to serve existing files.
Use `--no-open` to prevent the browser from opening.
`--clean` remains compatible. Vite cleans `docs/` during each build.
An occupied port stops the launcher instead of selecting another port.
Run the launcher from any directory.
PowerShell is not required on macOS.

Windows users can still run `.\start-server.ps1` after `npm ci`.
The build wrapper also uses Vite.
The server serves binary font files without text conversion.

## Source

| Path | Purpose |
|---|---|
| `src/App.jsx` | Dashboard, sidebar, settings, and appearance |
| `src/components/AppDetails.jsx` | App details |
| `src/components/AppGrid.jsx` | App cards with icon, name, and developer |
| `src/components/AppIcon.jsx` | Shared app images and fallback icons |
| `src/components/PresetQueries.jsx` | Preset query tiles |
| `src/components/QueryEditor.jsx` | Simple AND and nested AND / OR query editors, preview, and Prompt TODO |
| `src/components/ExportResults.jsx` | JSON download of the complete applied result set |
| `src/components/ui/` | Generated shadcn components |
| `src/lib/catalog.js` | React adapter for the existing loader and search |
| `src/lib/catalog-cache.js` | Persistent catalog snapshots in IndexedDB |
| `src/lib/preferences.js` | Browser preferences and storage checks |
| `src/lib/preset-queries.js` | Capability evidence and unique app counts |
| `src/lib/app-query.js` | Structured queries, validation, summaries, and variant-consistent evaluation |
| `src/lib/app-definition-schema.js` | Known and observed property types, object paths, and array-item shapes |
| `src/lib/saved-queries.js` | Named browser-local query persistence and storage feedback |
| `js/data-loader.js` | Catalog loading and request caching |
| `js/search-engine.js` | Existing search algorithms |
| `tests/dashboard.spec.js` | Browser checks |
| `tests/preset-queries.spec.js` | Capability and count checks |
| `tests/app-query.spec.js` | Structured-query evaluation and validation checks |
| `tests/advanced.spec.js` | Advanced workspace, mode switching, presets, and responsive browser checks |

The previous DOM renderers and CSS remain as reference files.
The new entry point does not load them.
