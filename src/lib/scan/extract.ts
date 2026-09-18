import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { mapScan, type ScanOutput, type ScanResult } from "./map";

/**
 * Reads a photo of a pool-store printout, a test strip or a kit result with a vision
 * model and returns the numbers for review. The image lives in memory for the length
 * of the request and is never written anywhere by Tuffo.
 */

export const SCAN_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ScanMediaType = (typeof SCAN_MEDIA_TYPES)[number];

const DEFAULT_MODEL = "claude-sonnet-4-6";

const TOOL = {
  name: "record_water_test",
  description: "Record the water test results visible in the photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      source: {
        type: "string",
        enum: ["leslies", "pinch_a_penny", "other_store", "test_strip", "test_kit", "digital_tester", "unknown"],
        description: "Where the result comes from, judged from logos, layout and wording.",
      },
      readings: {
        type: "object",
        properties: {
          free_chlorine_ppm: { type: ["number", "null"] },
          total_chlorine_ppm: { type: ["number", "null"] },
          combined_chlorine_ppm: { type: ["number", "null"] },
          ph: { type: ["number", "null"] },
          total_alkalinity_ppm: { type: ["number", "null"] },
          calcium_hardness_ppm: { type: ["number", "null"] },
          cyanuric_acid_ppm: { type: ["number", "null"] },
          salt_ppm: { type: ["number", "null"] },
          phosphate_ppb: { type: ["number", "null"], description: "Phosphates in ppb (1 ppm = 1000 ppb)." },
          borate_ppm: { type: ["number", "null"] },
          tds_ppm: { type: ["number", "null"] },
          copper_ppm: { type: ["number", "null"] },
          iron_ppm: { type: ["number", "null"] },
          water_temperature: { type: ["number", "null"] },
          water_temperature_unit: { type: ["string", "null"], enum: ["F", "C", null] },
        },
        additionalProperties: false,
      },
      test_date: { type: ["string", "null"], description: "Date printed on the result as YYYY-MM-DD, else null." },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      uncertain_fields: {
        type: "array",
        items: { type: "string" },
        description: "Names of readings that were hard to read or estimated (strip colours, blurred digits).",
      },
      notes: { type: "string", description: "One short sentence for the user, only if something needs saying." },
    },
    required: ["source", "readings", "confidence", "uncertain_fields"],
  },
};

const INSTRUCTIONS = `You are reading a photo for a pool-care app. It shows either a printed water-test
report from a pool store (Leslie's, Pinch A Penny or another), a colour test strip next to
its chart, a drop-kit result, or a digital tester screen.

Record every value you can read, as the numbers printed, in the units shown (convert ppm
of phosphate to ppb). Use null for anything not shown. Never invent a value: a blank or
unreadable field is null and goes in uncertain_fields. If the report lists "Total
chlorine" and "Free chlorine", record both and leave combined_chlorine_ppm null unless it
is printed. For a test strip, estimate from the colours, mark confidence low and list
every estimated field as uncertain. Ignore product recommendations and prices.`;

export async function extractReading(image: { bytes: Buffer; mediaType: ScanMediaType }): Promise<ScanResult> {
  const apiKey = serverEnv.anthropicApiKey();
  if (!apiKey) throw new Error("scan-not-configured");

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
  const model = serverEnv.scanModel() ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: image.mediaType, data: image.bytes.toString("base64") },
          },
          { type: "text", text: INSTRUCTIONS },
        ],
      },
    ],
  });

  const call = response.content.find((block) => block.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("scan-no-result");
  return mapScan(call.input as ScanOutput, {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
}
