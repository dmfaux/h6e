import { eveChannel } from "eve/channels/eve";
import { localDev } from "eve/channels/auth";

// The framework's own HTTP API (/eve/v1/*), which is the model-backed
// conversational surface. Phase 1 makes no model call and has no caller for it
// outside a developer machine, so it accepts only local development requests
// and refuses every production request (health stays public). The scaffold's
// vercelOidc() would have let any Vercel OIDC holder reach the agent outside the
// auth interface (ADR 0003); add a real policy here when a phase needs this
// surface, not before.

export default eveChannel({
  auth: [localDev()],
});
