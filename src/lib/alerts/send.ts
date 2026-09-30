import "server-only";

import type { RenderedEmail } from "./email";

/** Sends one email through Resend's HTTP API. Throws with the status on failure. */
export async function sendEmail(input: {
  apiKey: string;
  to: string;
  email: RenderedEmail;
  /** One-click unsubscribe (RFC 8058): a POST to this URL stops the alerts. */
  unsubscribeUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const response = await (input.fetchImpl ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Tuffo <hello@tuffo.app>",
      to: [input.to],
      reply_to: "hello@tuffo.app",
      subject: input.email.subject,
      text: input.email.text,
      html: input.email.html,
      headers: {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Resend's error bodies are short and carry no secrets.
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`resend ${response.status} ${detail}`);
  }
}
