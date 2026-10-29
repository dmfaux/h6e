// eve's ambient `workflow/api` declaration (eve/workflow-modules) lists only
// start, getRun, resumeHook and getHookByToken, but it resolves the specifier
// to the vendored runtime module, which also exports getWorld. The run needs
// the World's deployment id where VERCEL_DEPLOYMENT_ID is unset (the local
// world), exactly as eve's own session runtime resolves it.
declare module "workflow/api" {
  export function getWorld(): Promise<{ getDeploymentId(): Promise<string> }>;
}
