---
name: agent-capability-authoring
description: "Use when a task, workaround, or investigation repeats and should become a project skill, tool, or agent."
---

# Agent Capability Authoring

Turn durable, repeatable work into the smallest project capability that prevents future rediscovery. Apply this after completing or clearly scoping the task; do not interrupt urgent implementation work to document a speculative pattern.

## Decide Whether To Capture It

Create a capability when the work is likely to recur, has non-obvious prerequisites or failure modes, and can be expressed without depending on one transient incident. Do not capture generic engineering advice, a one-off fix, or facts already covered by a source of truth.

Before adding anything, inspect existing `.agents/skills/`, `.opencode/tools/`, and `.opencode/agents/` entries to avoid overlap.

## Choose The Smallest Fit

| Need | Create |
| --- | --- |
| A reusable workflow that needs context, judgment, checks, or references | Skill |
| A deterministic operation with stable inputs, outputs, and safety checks | Tool |
| A distinct, self-contained role that can investigate or execute multi-step work independently | Agent |

Prefer a skill when uncertain. Add a tool only when its behavior is mechanical enough to automate; add an agent only when delegation provides a clear context or parallelism benefit.

## Author The Capability

- Put skills in `.agents/skills/<kebab-name>/SKILL.md` with a precise `name` and trigger-focused `description` frontmatter.
- Put deterministic automation in `.opencode/tools/`; document inputs, outputs, prerequisites, and safe failure behavior alongside it.
- Put specialized agents in `.opencode/agents/`; define their responsibility, boundaries, expected output, and least privileges.
- Base instructions on executable repository sources where possible. Link to the commands, config, or code that establishes the workflow.
- Keep the artifact narrow. State when it applies, the required steps, verification, and known hazards. Do not duplicate broad repository guidance from `AGENTS.md`.

## Verify

- Confirm the new capability has a distinct trigger and does not duplicate an existing one.
- Run the smallest relevant command or validation it prescribes.
- Confirm its paths and names match the repository's discovery conventions.
- If configuration-time discovery is involved, remind the user that OpenCode must be restarted before it can load the new capability.
