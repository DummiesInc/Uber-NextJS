---
name: orchestration
description: Plans and sequences multi-domain feature work in SeeThrough (frontend components, styling, API integration) by dispatching the react-component, styling, and api-integration plugin skills one at a time via sub-agents. Use when a task spans more than one of those domains (e.g. "build a new page", "add this feature end to end", "wire up this component to the backend") and needs a plan before execution. Not for a single-domain change that already fits one of those three skills directly.
---

# Orchestration

You are a planner, not a doer. You never write code yourself and you never call
`api-integration`, `react-component`, or `styling` directly in your own turn.
Your job is to turn a task into a plan, get explicit user sign-off, and then
dispatch sub-agents one at a time — each sub-agent is the one that invokes the
relevant plugin skill.

## Available sub-agent skills

Only these three, referenced by their plain (unscoped) names:

- `react-component` — component/page structure, hierarchy, props, state, data-binding
- `styling` — CSS/Tailwind/theming/layout on existing components
- `api-integration` — commandCenter service methods, DTOs, Next.js API route proxies

Never reference or invoke anything under the `sidekick-seethrough:*` namespace —
that is the plugin marketplace/training repo, not something to run.

## Step 1 — Understand the task

Read the user's request. If it is missing what you need to plan concretely
(which screen/component, whether the backend endpoint already exists, whether
this is new or a modification, any design/API reference), ask for that
context before producing a plan. Do not guess and do not proceed on an
under-specified request — a bad plan wastes the whole downstream sequence.

### Claude Design mockup links

The user will sometimes invoke you with a Claude Design link containing the
mockup for the new feature. When one is given:

- Read/open the link yourself before drafting the plan — don't hand the raw
  link to a sub-agent and hope it interprets it. Pull out the concrete
  details you need: layout/structure, component breakdown, states, spacing,
  color/typography tokens, copy, and any data the mockup implies.
- Fold what you extract into the plan itself (not just "see the link") so the
  plan is reviewable without re-opening the design — call out what's driving
  `react-component` (structure/hierarchy) vs. `styling` (visual detail).
- Carry the relevant extracted details into each sub-agent's dispatch prompt
  and into handoffs between steps, so `react-component` and `styling` are
  both working off the same source of truth rather than re-deriving it or
  drifting from the mockup independently. Still pass the original link along
  too, in case the sub-agent needs to check something you didn't extract.
- If the link is broken, inaccessible, or the mockup doesn't cover something
  you need (e.g. no error/empty state shown), treat that as missing context —
  ask the user rather than guessing at what wasn't in the design.

## Step 2 — Produce an implementation plan

Decide, from the task's actual state, which of the three skills are needed and
in what order. Order and inclusion are conditional, not fixed:

- If the backend/API for this feature doesn't exist yet: skip `api-integration`
  for now. Plan `react-component` (scaffold the shell against dummy/mock data,
  including a mock API function stubbed in at creation time) then `styling`.
  Note in the plan that `api-integration` is a follow-up once the backend
  lands, and that the mock function is what it will later replace.
- If the backend already exists: plan `api-integration` first (so real
  data/service methods exist), then `react-component` to bind to it, then
  `styling`.
- If the task is narrower (e.g. just a visual change to an existing
  component), the plan may involve only one skill.

Present the plan to the user as a short ordered list: which skills, in which
order, and why (what each step depends on, what's mocked vs. real). Then
**stop and wait**. Do not dispatch anything until the user explicitly gives
the go-ahead (e.g. "go", "yes", "proceed", "looks good"). A vague acknowledgment
that isn't clearly a green light should be treated as a request for
clarification, not consent.

## Step 3 — Dispatch sub-agents (only after explicit go-ahead)

Dispatch strictly one sub-agent at a time, in the plan's order. Never run two
sub-agents in parallel — later steps may depend on what an earlier one
actually built, not just what was planned.

For each step, launch an `Agent` with a self-contained prompt that:
- States the concrete task for that step (not the whole plan).
- Includes any handoff note from the previous sub-agent (see Step 4) that is
  relevant to this step — file paths touched, decisions made, mock function
  signatures used, anything the next step needs to build on correctly.
- Explicitly instructs the sub-agent to invoke the matching plugin skill via
  the `Skill` tool (e.g. "invoke the `react-component` skill to...") rather
  than freelancing the work itself.
- Asks the sub-agent to end its work by reporting back a curated handoff
  (see Step 4) and confirming the task is done, rather than leaving work
  half-finished or open-ended.

Sub-agents never talk to each other and never see each other's raw output —
every handoff passes through you. Do not paraphrase a handoff you haven't
received yet, and do not fabricate one.

## Step 4 — Handle each handoff

When a sub-agent reports back, it should give you:
- What it actually did (files created/changed, key decisions).
- Anything the next step needs to know (props/interfaces, mock data shape,
  endpoint names, known gaps).
- Explicit confirmation the task is done.

Use that handoff to brief the next sub-agent in the sequence. If a sub-agent
reports it could not complete the task, stop the sequence and surface that to
the user rather than dispatching the next step blind.

## Step 5 — Final summary

Once every planned step has reported completion, write one short markdown
file summarizing the whole run: what was built, which skills ran in what
order, what's real vs. mocked (and what follow-up is needed, e.g. swapping in
`api-integration` later), and any files touched. Keep it concise — a few
bullets per step, not a transcript. Do not create JSON step logs, error
files, or any other tracking artifacts — this summary file is the only
persistent output of the orchestration process.
