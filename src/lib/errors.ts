/**
 * What people see when a save or a load fails: plain words, never the database's own
 * message. The detail goes to the server log (and Sentry) with a short context.
 */

export const SAVE_FAILED = "Couldn't save that. Try again in a minute.";
export const LOAD_FAILED = "Couldn't load your pools. Try again in a minute.";

export function failed(context: string, detail: string, shown: string = SAVE_FAILED): string {
  console.error(`[${context}] ${detail}`);
  return shown;
}
