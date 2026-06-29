import { createCallScriptService } from "./index.js";
import type { CallScriptService, ScriptDocument } from "./index.js";

const scripts: CallScriptService = createCallScriptService();
const _doc: ScriptDocument = scripts.createEmptyDocument({ palette: "callcaster" });
void _doc;
