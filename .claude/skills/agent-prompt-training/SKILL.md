---
name: agent-prompt-training
description: Drafts and revises the prompts/instructions for the react-component, styling, and api-integration plugin sub-agents based on the user's training notes, producing review-ready markdown files. Use when the user wants to improve, train, tune, or add smarter instructions to one of those sub-agents. Does not touch the marketplace repo or plugin files directly — output is handed to the user to apply themselves.
---

# Agent Prompt Training

You help iterate on the prompts that power the `react-component`, `styling`,
and `api-integration` sub-agents (or any other sub-agent the user names), so
they produce better/more efficient code over time. You only ever produce
markdown files for the user to review and apply — you never edit the
marketplace repo (`sidekick-seethrough:*`) or any plugin's actual prompt file
yourself. Applying the change to the real project/marketplace is explicitly
the user's job, not yours.

## Step 1 — Get the training request

Ask (if not already given): which sub-agent this is for, and what the user
wants to change — a new rule, a correction to a bad pattern you or they
noticed, an efficiency/style guideline, an example to add, etc. If the
request is vague ("make it write better code"), ask for the specific
behavior or mistake driving the request — a training note needs to be
concrete enough to turn into instruction text.

## Step 2 — Draft the new training portion only

Write a markdown file containing **only the new addition** — not merged with
anything existing. This is a review artifact, so keep it scoped to exactly
what's being proposed:

- File: `training-drafts/<sub-agent>-training-draft-<YYYY-MM-DD>.md`
- Contents: a short heading naming the sub-agent, then the proposed new
  instruction text itself (written the way it should read inside a prompt —
  imperative, concrete, no meta-commentary about "the user asked for this"),
  plus a one-line rationale noting why (what problem this fixes or what
  pattern this encourages).

Present this to the user and wait for them to confirm they're satisfied.
Treat anything short of clear approval ("yes", "looks good", "use this") as
a request for revision — iterate on the draft in place rather than moving to
Step 3 on an ambiguous response.

## Step 3 — Produce the full revision

Once approved, you need the sub-agent's current prompt to revise. If it
hasn't been provided in this conversation, ask the user for it (paste the
content, or point you to the file/path if it's accessible from here) —
never fabricate or assume the existing prompt's contents.

Combine the current prompt with the approved training portion into a new
file:

- File: `training-drafts/<sub-agent>-revised-<YYYY-MM-DD>.md`
- Decide whether the approved addition should be appended as a new section
  or woven into/revising an existing section, based on whether it's a novel
  rule or a correction to something already there. Say which you did and
  why in a one-line note at the top of the file, above the actual prompt
  content.
- The bulk of the file should be the full, ready-to-use revised prompt —
  something that could be pasted directly into the sub-agent's definition —
  not a diff or a summary of changes.

## Step 4 — Hand off

Tell the user the revised file is ready and that applying it — copying it
into the correct project/skill file and updating the marketplace — is on
them. Don't attempt to locate or write into the marketplace repo yourself,
even if it's accessible from this session.
