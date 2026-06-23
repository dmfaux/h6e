# Edge protection on the public intake placeholder (Task 0.7)

This records the edge protection that fronts the public intake placeholder, satisfying Phase 0 requirements F1 and F2. The endpoint is a placeholder only: it occupies the URL Phase 1's WhatsApp and Teams intake and webhook ingress will later use (ADR 0010), and carries no intake, webhook, channel, or candidate-data logic.

## The surface

- Route: `GET /intake` and `POST /intake`, defined in `agent/channels/intake.ts`.
- Behaviour: returns a static placeholder JSON (HTTP 200), no logic.
- Auth: none. It is internet-facing by design (unlike the guarded `/internal/whoami`). The liveness check `/eve/v1/health` stays the other open surface.

## The edge protection in front of it

Two Vercel-native, edge-level layers sit in front of the application, configured on the `h6e` project (team `dmfauxs-projects`). Both run at the edge before a request reaches the agent, so abuse is met at the edge, not by the application (requirement F2).

1. Managed bot ruleset (Vercel WAF Bot Protection). The `bot_protection` managed ruleset is active in `log` mode project-wide. This is Vercel's edge bot identification: it classifies automated traffic at the edge and records detections. It runs in `log` (non-blocking) in Phase 0 so it does not challenge the liveness path or uptime monitoring, which would otherwise break the Task 0.2 checks. Phase 1 turns this up to `challenge` or `deny` when the endpoint becomes live intake.

2. WAF custom rule on the intake surface. A custom rule, `Intake placeholder edge bot block`, denies requests where `path eq /intake` and the user agent matches a bot signature (`bot|Bot|crawler|spider|scrapy|wget|python|curl|headless`). This is the demonstrable edge block for F2: a bot probe to `/intake` is denied (HTTP 403) at the edge, while a normal request reaches the placeholder (HTTP 200). It is scoped to `/intake` only, so it does not touch the rest of the project.

Automatic L3/L4/L7 DDoS mitigation is on for every Vercel project by default and needs no configuration.

The committed snapshot of this configuration is in `docs/phase-0/firewall-config.json`. The source of truth is the Vercel project firewall, managed through the `vercel firewall` CLI and the security API; the snapshot is committed for review and reproducibility.

## On "Bot ID"

The phase mandate names "WAF and Bot ID". Vercel BotID (the `botid` package) is a browser-signal product: it injects a client script on a page (`initBotId` / `BotIdClient`) so that a later call to a protected path can be classified, and verified server-side with `checkBotId`. The Phase 0 intake placeholder is a server-only surface with no Vercel-served page, and Phase 1 makes it a server-to-server webhook (WhatsApp Business API, Teams / Graph), which also has no browser client. BotID's client-signal model therefore does not fit this surface.

The faithful edge bot protection for a server-only intake surface is Vercel's WAF bot management, which is what is configured here: the managed `bot_protection` ruleset plus the custom rule above. This is bot identification and mitigation at the edge, which is the intent of the "Bot ID" requirement. The phase spec already records that no separate Phase 0 ADR is needed for the edge placeholder and that the security posture folds into Phase 1 (ADR 0010, verified channel webhook ingress) when the endpoint becomes live. This decision is noted here and flagged for the Task 0.8 realignment rather than recorded as a new ADR.

## Reproducing the configuration

The project must be linked (`.vercel/project.json` is present). With the Vercel CLI authenticated:

```bash
# Managed bot ruleset (active, log mode) via the security API
curl -X PATCH "https://api.vercel.com/v1/security/firewall/config?projectId=<projectId>&teamId=<teamId>" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"managedRules.update","id":"bot_protection","value":{"active":true,"action":"log"}}'

# WAF custom rule on /intake (staged, then published)
vercel firewall rules add --json '{"name":"Intake placeholder edge bot block","conditionGroup":[{"conditions":[{"type":"path","op":"eq","value":"/intake"},{"type":"user_agent","op":"re","value":"bot|Bot|crawler|spider|scrapy|wget|python|curl|headless"}]}],"action":{"mitigate":{"action":"deny"}}}' --yes
vercel firewall publish --yes

# Inspect what is live
vercel firewall rules list --json
```

## Deferred to Phase 1 (ADR 0010)

- Live intake, webhook verification, and channel logic.
- Turning the managed bot ruleset up from `log` to `challenge`/`deny` once the endpoint is live and monitoring has a bypass.
- Any candidate-data handling.
