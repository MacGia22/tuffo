const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Waitlist sign-up.
 *
 * Until the database is connected, entries are forwarded to WAITLIST_WEBHOOK_URL
 * (any endpoint that accepts a JSON POST). Without it the route answers 503 so the
 * form can say the list is not open yet instead of pretending.
 */
export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return Response.json({ ok: false, message: "Send a JSON body with an email." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) {
    return Response.json({ ok: false, message: "That email address does not look right." }, { status: 400 });
  }

  const webhook = process.env.WAITLIST_WEBHOOK_URL;
  if (!webhook) {
    return Response.json(
      { ok: false, message: "The waitlist opens with the beta. Check back soon." },
      { status: 503 },
    );
  }

  const forwarded = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      source: "tuffo-landing",
      at: new Date().toISOString(),
    }),
  });

  if (!forwarded.ok) {
    return Response.json({ ok: false, message: "Could not save that right now." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
