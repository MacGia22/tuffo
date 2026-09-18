export function GET() {
  return Response.json({
    ok: true,
    service: "tuffo",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    time: new Date().toISOString(),
  });
}
