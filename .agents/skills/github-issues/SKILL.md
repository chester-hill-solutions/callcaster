---
name: github-issues
description: "Use when creating or editing GitHub issues, especially issue types, parent or child issues, and blocking or blocked-by dependencies."
---

# GitHub Issues

This skill extends `github-cli`; apply its authentication, repository-targeting, mutation, and general verification rules first. This skill owns only issue classification and relationships for `chester-hill-solutions/callcaster`.

## Issue Types

Use a GitHub issue type for primary work classification. Do not use a label such as `bug` as a substitute for the `Bug` type. Labels remain appropriate for orthogonal metadata, such as component, priority, status, or team ownership.

The following enabled organization types were verified for `chester-hill-solutions/callcaster` on **2026-08-08** using `gh 2.85.0`:

| Type | Use for |
| --- | --- |
| `Task` | A specific piece of work |
| `Bug` | An unexpected problem or behavior |
| `Feature` | A request, idea, or new functionality |
| `User Story` | A user goal |
| `Epic` | A large body of related work |
| `Change Request` | A requested change |
| `User Log` | A record of actions or experience details |

This inventory expires after **2026-09-07** (30 days). Recheck it before choosing a type when the date has passed, the target organization changes, or `gh` rejects a type:

```bash
gh api graphql -f query='query { organization(login: "chester-hill-solutions") { issueTypes(first: 100) { nodes { id name isEnabled description } } } }'
```

Use only names returned with `isEnabled: true`; record the new verification date and CLI version in this skill when the inventory changes.

## Create

Use native create flags to assign type and relationships at creation time:

```bash
gh issue create \
  --repo chester-hill-solutions/callcaster \
  --title "Concise, actionable title" \
  --body "Markdown body" \
  --type Bug \
  --parent 100 \
  --blocked-by 200 \
  --blocking 300
```

Omit relationship flags that do not apply. `--parent` makes the new issue a child of the given issue. `--blocked-by` means the new issue cannot proceed until the listed issue is resolved; `--blocking` means the new issue prevents the listed issue from proceeding.

## Edit Relationships And Type

Fetch the issue first, then use the exact relationship direction:

```bash
gh issue view 123 \
  --repo chester-hill-solutions/callcaster \
  --json number,title,issueType,parent,subIssues,blockedBy,blocking,labels,url

gh issue edit 123 --repo chester-hill-solutions/callcaster --type Feature
gh issue edit 123 --repo chester-hill-solutions/callcaster --parent 100
gh issue edit 100 --repo chester-hill-solutions/callcaster --add-sub-issue 123
gh issue edit 123 --repo chester-hill-solutions/callcaster --add-blocked-by 200
gh issue edit 123 --repo chester-hill-solutions/callcaster --add-blocking 300
```

Use `--remove-type`, `--remove-parent`, `--remove-sub-issue`, `--remove-blocked-by`, or `--remove-blocking` only after verifying the existing relationship and desired direction. A parent/child relation expresses decomposition; a blocking relation expresses sequencing. Do not substitute one for the other.

## Issue-Specific Verification

After create or edit, fetch the issue with the JSON fields above and confirm the type, parent or children, dependencies, and labels. Report any unavailable type or relationship rather than silently falling back to a label or changing the intended hierarchy.
