import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { scanModel, type ScanMediaType } from "./extract";
import { mapPumpScan, type PumpScanOutput, type PumpScanResult } from "./pump-map";

/**
 * Reads a screenshot or photo of a pump's schedule (a variable-speed pump's app or
 * control panel, or a timer) and returns the runs for review. The image lives in memory
 * for the length of the request and is never written anywhere by Tuffo.
 */

/** Like SCAN_PROMPT_VERSION, for the pump-schedule reader. Bump it when TOOL or INSTRUCTIONS change. */
export const PUMP_PROMPT_VERSION = "pump-1";

const TOOL = {
  name: "record_pump_schedule",
  description: "Record the daily pump schedule visible in the image.",
  input_schema: {
    type: "object" as const,
    properties: {
      runs: {
        type: "array",
        description: "Each scheduled run in a day, in order.",
        items: {
          type: "object",
          properties: {
            start: { type: "string", description: "Start time as shown, e.g. 08:00 or 8:00 AM." },
            end: { type: "string", description: "End time as shown." },
            speed: { type: ["number", "null"], description: "The run's speed or flow setting as a number, if shown." },
            speed_unit: {
              type: ["string", "null"],
              enum: ["rpm", "gpm", "lpm", "pct", "level", null],
              description:
                "rpm for speed in RPM, gpm for flow in US gallons per minute, lpm for flow in litres per minute (convert m³/h × 16.67), pct for speed in percent, level for a numbered speed (Speed 1, 2, 3…).",
            },
            speed_label: { type: ["string", "null"], description: "Speed name if shown instead of a number (Low, High, Eco)." },
          },
          required: ["start", "end"],
        },
      },
      skipped: {
        type: "array",
        items: { type: "string" },
        description: "Programs left out because they are not part of the daily schedule (timer, quick clean, manual run), by name.",
      },
      cut_off: { type: "boolean", description: "True when the list continues past the edge of the image." },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      notes: { type: "string", description: "One short sentence for the user, only if something needs saying." },
    },
    required: ["runs", "confidence"],
  },
};

const INSTRUCTIONS = `You are reading an image for a pool-care app. It shows a pool pump's daily
schedule: a variable-speed pump app or control panel (Pentair, Hayward, Jandy, CircuPool,
AstralPool, Zodiac, Davey, Waterco and others) or a mechanical timer. Record each scheduled
run with its start and end time and its setting as the pump shows it: speed in RPM, flow in
GPM or L/min, speed in percent, or a numbered speed (Speed 1, 2, 3…).
Only runs with a start and end time on the daily schedule count. Leave out programs that
run for a set time when started by hand (for example "Timer: 10 hours", quick clean,
manual or boost runs) and list their names in skipped. If a program is only partly
visible at the edge of the image, leave it out and set cut_off to true.
If the screen lists a duration instead of an end time, work out the end time. Never invent
a run: if nothing readable is shown, return no runs and say so in notes. Ignore weekday
toggles unless runs differ by day; then record the most common day and say so in notes.`;

export async function extractPumpSchedule(image: { bytes: Buffer; mediaType: ScanMediaType }): Promise<PumpScanResult & { usage: { model: string; inputTokens: number; outputTokens: number } }> {
  const apiKey = serverEnv.anthropicApiKey();
  if (!apiKey) throw new Error("scan-not-configured");
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
  const model = scanModel();
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.bytes.toString("base64") } },
          { type: "text", text: INSTRUCTIONS },
        ],
      },
    ],
  });
  const call = response.content.find((block) => block.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("scan-no-result");
  return {
    ...mapPumpScan(call.input as PumpScanOutput),
    usage: { model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
