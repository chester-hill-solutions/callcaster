# Imported Graphify snapshot

These generated files were updated from the current checkout. They can help
find related files, but confirm each finding in current source before using it in an
issue, code change, or review.

The graph update used commit `e4bb8ac6067a49877426f93aa5288f60f8142729`. Semantic extraction usage was unavailable,
and SQL parsing support was not installed; see the update summary for these limits.

To build a current graph, use the optional Graphify skill in
`../.opencode/skills/graphify/SKILL.md`. It uses a pinned, isolated Python install.
Keep private files out of the scan. A successful scan must record its source
commit before replacement output is described as verified.

The project OpenCode config targets the installed V1 host (1.18.33). Its local
plugin is found through `.opencode/plugins/`, without a second config entry.
The Graphify plugin also has a V2 entry point. V2 uses a different MCP config
shape: move both Railway and Twilio under `mcp.servers` when using a V2 host.
