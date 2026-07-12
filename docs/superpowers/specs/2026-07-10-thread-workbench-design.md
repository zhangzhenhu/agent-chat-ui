# Thread Workbench Design

## Summary

Introduce a thread-level right-side workbench for debugging and inspection features that should not be attached to `ThinkingTraceCard`.

The first version moves thread-oriented capabilities into a dedicated `Thread Workbench` and keeps run-oriented capabilities on the thinking card:

- `Thinking Trace` card keeps:
  - `Runtime Trace`
  - `Telemetry`
- right-side `Thread Workbench` owns:
  - `State`
  - `Skills`

This separates "current run process visibility" from "thread-level inspection".

## Problem

The current UI attaches `Thread State`, `Runtime Trace`, and `Telemetry` entry points to `ThinkingTraceCard`.

That is no longer a good fit:

- `Thread State` is thread-level, not thinking-specific
- new child-state inspection is also thread-level
- skill inspection is thread-level
- the card is becoming a dumping ground for unrelated tools
- future expansion will make the card header increasingly crowded and conceptually unclear

The user also added backend debug endpoints that make this mismatch more obvious:

- child thread state:
  - `GET /api/debug/child-state?specialist=<specialist>&thread_id=<thread_id>`
- skill list:
  - `GET /api/debug/skills`
  - `GET /api/debug/skills?agent_name=<agent_name>`
- skill file detail:
  - `GET /api/debug/skills/file?path=<skill_path>`

## Goals

- Create a stable thread-level home for inspection features
- Keep `Thinking Trace` focused on the current run's process
- Support main thread state plus specialist child state
- Support process skill browsing and skill file detail viewing
- Keep first-version interaction simple and predictable
- Preserve room for future thread-level tools without redesigning the page again

## Non-Goals

- Do not redesign `Thinking Trace` content itself
- Do not move `Runtime Trace` out of `Thinking Trace`
- Do not move `Telemetry` out of `Thinking Trace` in this version
- Do not make tabs dynamic from backend yet
- Do not build a tree editor or structured JSON explorer in version one

## User Decisions Captured

- The new surface is a thread-level workbench, not a run-only panel
- `Runtime Trace` stays on `Thinking Trace`
- `Telemetry` also stays on `Thinking Trace` for now
- `State` tabs use business-facing specialist labels, not `parent/child`
- `Skills` tabs also use specialist labels
- tabs are fixed in version one
- tab changes should auto-request data
- dynamic tab population can be explored later via backend

## Information Architecture

### Right-side Thread Workbench

The page gets a persistent narrow dock on the far right.

The dock exposes two thread-level entry points:

- `State`
- `Skills`

Clicking an entry expands a right-side workbench drawer.

The drawer is single-instance:

- only one tool page is visible at a time
- clicking the active entry collapses the drawer
- clicking another entry switches the drawer content directly

### Thinking Trace Card

The card keeps only run-level tools:

- `Runtime Trace`
- `Telemetry`

`Thread State` is removed from the card header.

## Layout

### Desktop

- a narrow persistent dock is attached to the right edge
- the dock shows compact icons with hover tooltip labels
- activating a dock item opens a drawer from the right edge toward the chat area
- the drawer does not replace the page with a modal dialog
- the main chat area remains visible and is compressed horizontally

Recommended initial drawer width:

- `480px` to `560px`

### Mobile

Mobile does not keep a permanently visible edge dock.

Fallback behavior:

- show a floating `Workbench` trigger
- open the same content in a full-width drawer or bottom sheet
- keep the same tabs, states, and request behavior

## State Panel Design

### Top-level behavior

The `State` workbench page uses fixed tabs:

- `main`
- `gas_need`
- `food_supply`
- `food_need`
- `gas_supply`

These labels are intentionally user-facing and specialist-oriented.

### Data source mapping

- `main`
  - use the existing main thread state data already available in the UI
  - do not call the child-state endpoint
- `gas_need`
  - `specialist=gas_need`
- `food_supply`
  - `specialist=food_supply`
- `food_need`
  - `specialist=food_need`
- `gas_supply`
  - `specialist=gas_supply`

The specialist tabs call:

- `GET /api/debug/child-state?specialist=<specialist>&thread_id=<thread_id>`

### Interaction

- default active tab: `main`
- switching tabs automatically requests data
- if cached data exists, show cached content immediately and refresh in background
- `Refresh` forces a new request
- `Copy JSON` copies the current visible payload

### Content structure

Each tab uses the same panel structure:

- header row
  - active tab label
  - request summary
  - last updated time
  - `Refresh`
  - `Copy JSON`
- body
  - JSON viewer

### States

Each tab supports:

- loading
- loaded
- empty
- error
- stale cached data while refreshing

Recommended empty-state wording:

- `main`: no current thread state available
- specialist tabs: no child state available for this specialist

Recommended error behavior:

- surface the failed request parameters
- show readable error text in-panel
- do not collapse the current content automatically

## Skills Panel Design

### Top-level behavior

The `Skills` workbench page uses fixed tabs:

- `全部`
- `gas_need`
- `food_supply`
- `food_need`
- `gas_supply`

### Data source mapping

- `全部`
  - `GET /api/debug/skills`
- `gas_need`
  - `GET /api/debug/skills?agent_name=gas_need_specialist`
- `food_supply`
  - `GET /api/debug/skills?agent_name=food_supply_specialist`
- `food_need`
  - `GET /api/debug/skills?agent_name=food_need_specialist`
- `gas_supply`
  - `GET /api/debug/skills?agent_name=gas_supply_specialist`

Skill detail is fetched separately:

- `GET /api/debug/skills/file?path=<skill_path>`

### Interaction

- default active tab: `全部`
- switching tabs automatically requests the skill list
- selecting a skill requests its detail file by `path`
- list and detail should be treated as separate loading states
- reopening the panel should preserve the last selected tab and last selected skill per tab when possible

### Content structure

Version one uses a vertical split inside the workbench:

- top area: skill list
- bottom area: selected skill detail

This is preferred over a left-right split because the workbench itself is already a side drawer.

#### Skill list area

Each list item should show:

- skill name when available
- file path
- lightweight metadata if present

The list should clearly indicate the selected item.

#### Skill detail area

The detail area shows the file content retrieved from `/api/debug/skills/file`.

Version one should prioritize reliability over rich rendering:

- raw content or markdown-source display is acceptable
- `Copy Path`
- `Copy Content`
- `Refresh`

Markdown rendering can be added later if needed, but is not required for the first version.

### States

The `Skills` panel must support:

- list loading
- list empty
- list error
- detail loading
- detail empty
- detail error

If the list is present but no skill is selected yet, the detail area should show a neutral placeholder rather than an error.

## Shared Fetching Model

Both `State` and `Skills` use the same general interaction model:

- auto-fetch on first open
- auto-fetch on tab switch
- local cache keyed by `thread_id + panel + tab`
- immediate cached render when available
- background refresh on revisit
- explicit refresh action for forced reload

This keeps the interaction fast without hiding that data may have changed.

## Visual Direction

The workbench should feel like a utility surface, not a business dashboard.

Recommended tone:

- low visual weight dock
- clear active states
- restrained colors
- dense but readable panel layout
- consistent code-viewer treatment for raw JSON and text payloads

The drawer should look related to the chat UI, but visually separate from the message stream and the thinking card.

## Why This Design

This design is preferred over keeping everything on `Thinking Trace` because:

- it restores conceptual clarity
- it avoids overloading one card with unrelated thread tools
- it gives a durable extension point for future debug and inspection features
- it preserves `Thinking Trace` as a run-oriented surface

It is preferred over a top toolbar because:

- a right-edge dock scales better as more tools are added
- it avoids horizontal crowding in the chat header
- it gives a more stable thread-level "home" for inspection actions

It is preferred over modals-only because:

- the user can keep chat context visible while inspecting data
- switching between `State` and `Skills` feels like moving inside one workspace rather than opening unrelated dialogs

## Risks

- a side drawer can make the chat column feel cramped on smaller desktop widths
- fixed specialist tabs may show empty states often
- raw JSON and raw file content may feel too technical for some users

These are acceptable in version one because:

- the surface is explicitly for debug/inspection usage
- stable navigation matters more than visual minimalism
- fixed tabs were a user decision for the first version

## Future Extensions

Potential later extensions:

- dynamic specialist tabs from backend
- richer skill metadata cards
- rendered markdown skill preview
- more thread-level tools in the dock
- finer-grained telemetry placement review
- structured JSON tree explorer

Those should build on this workbench rather than reintroducing tool buttons into `ThinkingTraceCard`.

## Acceptance Criteria

- `Thread State` is no longer entered from `Thinking Trace`
- a right-side `Thread Workbench` exists with `State` and `Skills`
- `Runtime Trace` stays on `Thinking Trace`
- `Telemetry` stays on `Thinking Trace`
- `State` uses fixed tabs:
  - `main | gas_need | food_supply | food_need | gas_supply`
- `Skills` uses fixed tabs:
  - `全部 | gas_need | food_supply | food_need | gas_supply`
- `State` specialist tabs auto-fetch child-state data
- `Skills` tabs auto-fetch skill lists
- selecting a skill auto-fetches its file detail
- the workbench can collapse and reopen without losing all local UI context
