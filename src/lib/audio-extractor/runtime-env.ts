/** True only on Vercel serverless (not local `vercel dev` unless VERCEL=1). */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}
