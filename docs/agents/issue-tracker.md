# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file
- Comments and conversation history append under a `## Comments` heading

## Publishing

When a skill says “publish to the issue tracker”, create a file under `.scratch/<feature-slug>/`, creating the directory when needed.

## Fetching tickets

Read the referenced Markdown file. The user will normally provide its path or issue number.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`
- Type: recorded as `Type: research|prototype|grilling|task`
- Status: recorded as `Status: claimed|resolved`
- Blocking: recorded as `Blocked by: NN, NN`
- Frontier: the first open, unblocked, and unclaimed ticket by number
- Claim: set `Status: claimed` before starting work
- Resolve: append the result under `## Answer`, set `Status: resolved`, and update the map
