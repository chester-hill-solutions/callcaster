// graphify OpenCode plugin (dual v1 + v2 entrypoint).
// Injects a knowledge graph reminder before bash tool calls when the graph exists.
//
// - OpenCode v2 reads the default export's `id` and `setup()` (or `effect()`
//   for Effect plugins) and ignores `server()`. See
//   https://opencode.ai/v2/docs/build/plugins/migrate-v1
// - OpenCode v1 (1.18.29+) calls `server()` and uses the returned hooks.
//   Older v1 releases expect a function export instead.
// - A single file in `.opencode/plugins/` therefore serves both runtimes:
//   v2 discovers `.opencode/plugin/` and `.opencode/plugins/`.
//
// IMPORTANT: keep the reminder string free of backticks and $(...) constructs.
// The hook prepends `echo "<reminder>" ; <cmd>` to the user's bash command;
// backticks inside the double-quoted echo trigger bash command substitution,
// which both corrupts tool output and silently executes the very graphify
// command we are only suggesting. Plain words render fine in opencode's TUI.
import { existsSync } from "fs";
import { join } from "path";
import { Plugin } from "@opencode/plugin";

const REMINDER =
  "[graphify] knowledge graph at graphify-out/. For focused questions, run graphify query with your question (scoped subgraph, usually much smaller than GRAPH_REPORT.md) instead of grepping raw files. Read GRAPH_REPORT.md only for broad architecture context.";

function isBashTool(tool) {
  return tool === "bash" || tool === "shell" || tool === "execute";
}

function prependReminder(input) {
  // ';' not '&&' — Windows PowerShell 5.1 rejects '&&' as a statement
  // separator, breaking the first bash command of the session (#1646).
  const current = input.command ?? input.cmd ?? input.script;
  if (typeof current !== "string" || current.length === 0) return false;
  if (current.includes("[graphify] knowledge graph")) return true;
  const next =
    'echo "' + REMINDER + '" ; ' + current;
  if ("command" in input) input.command = next;
  else if ("cmd" in input) input.cmd = next;
  else if ("script" in input) input.script = next;
  else input.command = next;
  return true;
}

function graphExists(directory) {
  return (
    typeof directory === "string" &&
    directory.length > 0 &&
    existsSync(join(directory, "graphify-out", "graph.json"))
  );
}

async function resolveProjectDir(ctx, event) {
  const candidates = [
    event?.cwd,
    event?.directory,
    event?.worktree,
    event?.input?.cwd,
    event?.input?.directory,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0 && existsSync(candidate))
      return candidate;
  }
  // Directory of the session that triggered the hook. ctx.location describes
  // where this plugin instance loaded, not every session it observes.
  try {
    const sessionID = event?.sessionID;
    if (typeof sessionID === "string" && ctx?.session?.get) {
      const session = await ctx.session.get({ sessionID });
      const dir =
        session?.directory ??
        session?.info?.directory ??
        session?.project?.directory ??
        session?.data?.directory;
      if (typeof dir === "string" && dir.length > 0 && existsSync(dir)) return dir;
    }
  } catch {
    // Fall through: never block the tool because directory resolution failed.
  }
  return ctx?.location?.directory ?? process.cwd();
}

export default {
  ...Plugin.define({
    id: "graphify",
    async setup(ctx) {
      const reminded = new Set();
      await ctx.tool.hook("execute.before", async (event) => {
        if (!isBashTool(event?.tool)) return;
        const sessionKey =
          typeof event?.sessionID === "string" ? event.sessionID : "global";
        if (reminded.has(sessionKey)) return;
        const directory = await resolveProjectDir(ctx, event);
        if (!graphExists(directory)) return;
        if (!event?.input || typeof event.input !== "object") return;
        if (prependReminder(event.input)) reminded.add(sessionKey);
      });
    },
  }),
  async server(input) {
    const directory = input?.directory ?? process.cwd();
    let reminded = false;
    return {
      "tool.execute.before": async (hookInput, output) => {
        if (reminded) return;
        if (!graphExists(directory)) return;
        if (hookInput?.tool === "bash" && output?.args) {
          if (prependReminder(output.args)) reminded = true;
        }
      },
    };
  },
};
