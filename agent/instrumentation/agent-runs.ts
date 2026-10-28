import { disableInstrumentation } from "eve/instrumentation";

// eve exports traces to Vercel Agent Runs by default in preview and production.
// Off until that destination's retention and access are approved (ADR 0027,
// ADR 0006).

export default disableInstrumentation();
