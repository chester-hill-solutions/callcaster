# Imported Graphify snapshot

These generated files preserve the graph supplied in PR #2301. They can help
find related files. They do not prove the current code behavior.

The graph records commit `561541b0561a8c03f64522d721c3589de07c4169`. That commit
does not resolve in this repository. The source provenance is unverified, and
the graph predates recent changes on `dev`. Confirm each finding in current
source before using it in an issue, code change, or review.

To build a current graph, use the optional Graphify skill in
`../.opencode/skills/graphify/SKILL.md`. It uses a pinned, isolated Python install.
Keep private files out of the scan. A successful scan must record its source
commit before replacement output is described as verified.

The project OpenCode config targets the installed V1 host (1.18.33). Its local
plugin is found through `.opencode/plugins/`, without a second config entry.
The Graphify plugin also has a V2 entry point. V2 uses a different MCP config
shape: move both Railway and Twilio under `mcp.servers` when using a V2 host.
