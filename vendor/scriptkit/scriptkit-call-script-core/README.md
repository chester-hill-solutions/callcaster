# @chester-hill-solutions/scriptkit-call-script-core

Framework-agnostic call script schemas, validation, migration, routing, and merge tags.

```ts
import { createCallScriptService } from "@chester-hill-solutions/scriptkit-call-script-core";

const scripts = createCallScriptService();
const doc = scripts.migrateFromCallcasterFlow(flow);
const flow = scripts.serializeToCallcasterFlow(doc);
```

Reference: [docs/reference/call-script-api.md](../../docs/reference/call-script-api.md)
