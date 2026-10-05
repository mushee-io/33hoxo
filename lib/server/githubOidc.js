import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "33hoxo-worker";
const REPOSITORY = "mushee-io/33hoxo";
const REF = "refs/heads/main";
const WORKFLOW_SUFFIX = "/.github/workflows/worker.yml@refs/heads/main";
const JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

export async function verifyGitHubWorkerOidc(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    const error = new Error("Missing worker bearer token.");
    error.status = 401;
    throw error;
  }

  const token = auth.slice(7).trim();
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (payload.repository !== REPOSITORY) {
    const error = new Error("Worker token repository is not authorized.");
    error.status = 403;
    throw error;
  }
  if (payload.ref !== REF) {
    const error = new Error("Worker token must come from main.");
    error.status = 403;
    throw error;
  }

  const workflowRef = String(payload.workflow_ref || "");
  if (!workflowRef.endsWith(WORKFLOW_SUFFIX)) {
    const error = new Error("Worker token workflow is not authorized.");
    error.status = 403;
    throw error;
  }

  return {
    mode: "github-oidc",
    repository: payload.repository,
    ref: payload.ref,
    runId: payload.run_id,
  };
}
