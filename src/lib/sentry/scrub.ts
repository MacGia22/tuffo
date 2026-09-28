/**
 * What leaves the app in an error report. Sentry gets the error, the stack, the route
 * and the browser; never an email address, a cookie, a header, a request body or a
 * query string (sign-in links carry one-time tokens there).
 *
 * Kept free of Sentry imports so it can be unit-tested and shared by the browser and
 * server set-ups.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const KEEP_HEADERS = new Set(["content-type", "user-agent"]);

export function redactEmails(text: string): string {
  return text.replace(EMAIL, "[email]");
}

/** Drops the query string and fragment; keeps scheme, host and path. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

type Breadcrumb = { message?: string; data?: Record<string, unknown> };

type ScrubbableEvent = {
  message?: string;
  user?: unknown;
  server_name?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    env?: unknown;
  };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Breadcrumb[];
  extra?: Record<string, unknown>;
};

function scrubBreadcrumbData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "url" || key === "from" || key === "to") {
      out[key] = typeof value === "string" ? redactEmails(stripQuery(value)) : value;
    } else if (key === "body" || key === "request_body" || key === "response_body") {
      continue;
    } else {
      out[key] = typeof value === "string" ? redactEmails(value) : value;
    }
  }
  return out;
}

export function scrubBreadcrumb<T extends Breadcrumb>(crumb: T): T {
  const next = { ...crumb };
  if (typeof next.message === "string") next.message = redactEmails(next.message);
  if (next.data) next.data = scrubBreadcrumbData(next.data);
  return next;
}

/** Returns a copy with personal data removed; used as beforeSend and beforeSendTransaction. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const next = { ...event };
  delete next.user;
  delete next.server_name;
  delete next.extra;

  if (next.request) {
    const request = { ...next.request };
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    delete request.env;
    if (request.url) request.url = stripQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => KEEP_HEADERS.has(name.toLowerCase())),
      );
    }
    next.request = request;
  }

  if (typeof next.message === "string") next.message = redactEmails(next.message);
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((value) =>
        typeof value.value === "string" ? { ...value, value: redactEmails(value.value) } : value,
      ),
    };
  }
  if (next.breadcrumbs) next.breadcrumbs = next.breadcrumbs.map(scrubBreadcrumb);
  return next;
}
