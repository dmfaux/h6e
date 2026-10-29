// Test-only preload for the candidate run boot proof. Loaded into the server
// process with `NODE_OPTIONS=--import <this file>`, it wraps globalThis.fetch so
// a POST to Meta's Graph API lands on the proof's local stub instead. Nothing in
// src/ or agent/ knows about it: the production send still targets
// https://graph.facebook.com/, and this file redirects at the process boundary.

const GRAPH = "https://graph.facebook.com/";
const stub = process.env.GRAPH_STUB_URL;
if (!stub) throw new Error("GRAPH_STUB_URL is not set");

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(GRAPH)) {
    return realFetch(stub.replace(/\/$/, "") + "/" + url.slice(GRAPH.length), init);
  }
  return realFetch(input, init);
};
