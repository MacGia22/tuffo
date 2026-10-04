import type { Units } from "@/lib/format";
import { baseToShelf, formatShelf } from "@/lib/dose-format";
import type { StoredPlan } from "@/lib/plan/stored";
import { cellSettingText } from "@/lib/salt-cells";
import type { DueAlert } from "./decide";

/**
 * The one email a person gets on a day with alerts: a section per alert, then how to
 * change or stop them. Plain text and simple HTML; no images, no tracking.
 */

export interface EmailContext {
  units: Units;
  siteUrl: string;
  plans: Record<string, StoredPlan | undefined>;
  /** Today in each pool's time zone (YYYY-MM-DD): the week starts there, not at the plan's first day. */
  todays?: Record<string, string>;
  /** Signed link that stops every alert for this person. */
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function addLabel(ml: number, units: Units): string | null {
  if (!(ml > 0)) return null;
  const shelf = baseToShelf(ml, "mL", units);
  return shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : null;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Section {
  title: string;
  lines: string[];
  link: string;
}

function section(alert: DueAlert, ctx: EmailContext): Section {
  const poolUrl = `${ctx.siteUrl}/app/pools/${alert.poolId}`;
  const plan = ctx.plans[alert.poolId];
  if (alert.kind === "algae") {
    const min = plan?.summary.fc.min;
    const when = alert.detail.date ? weekday(alert.detail.date) : "soon";
    const day = plan?.days.find((d) => d.date === alert.detail.date);
    const add = day ? addLabel(day.addMl, ctx.units) : null;
    const salt = plan?.summary.kind === "swg";
    return {
      title: `${alert.poolName}: free chlorine may run low`,
      lines: [
        `With the forecast, free chlorine may fall below ${min ?? "the minimum"} ppm by ${when}, when algae can get a start.`,
        salt
          ? plan?.summary.swgPercent !== null && plan?.summary.swgPercent !== undefined
            ? `The plan suggests the salt cell at about ${cellSettingText(plan.summary.swgPercent, plan.summary.cellLevels)}; test, and top up with liquid chlorine if it is low.`
            : "Test, and top up with liquid chlorine if it is low."
          : add
            ? `The plan says to add ${add} of liquid chlorine that day. Test first if you can.`
            : "Test, and add chlorine if it is low.",
      ],
      link: poolUrl,
    };
  }
  if (alert.kind === "test_reminder") {
    const days = alert.detail.days ?? 0;
    return {
      title: `${alert.poolName}: time to test`,
      lines: [`It has been ${days} ${days === 1 ? "day" : "days"} since the last test. A fresh one keeps the advice and the plan on track.`],
      link: `${poolUrl}/readings/new`,
    };
  }
  if (alert.kind === "maintenance") {
    const tasks = alert.detail.tasks ?? [];
    return {
      title: `${alert.poolName}: maintenance due`,
      lines: [...tasks, "Mark each one done in Tuffo to set the next reminder."],
      link: `${poolUrl}/maintenance`,
    };
  }
  const lines: string[] = [];
  if (plan) {
    if (plan.summary.kind === "swg") {
      const setting = (percent: number) => cellSettingText(percent, plan.summary.cellLevels);
      lines.push(
        plan.summary.swgPercent !== null
          ? plan.summary.swgStart
            ? `Salt cell ${plan.summary.swgStart.percent === 0 ? "off" : `at about ${setting(plan.summary.swgStart.percent)}`} until ${weekday(plan.summary.swgStart.until)}, then about ${setting(plan.summary.swgPercent)} (about ${plan.summary.swgNeedPpm?.toFixed(1)} ppm of chlorine a day).`
            : `Salt cell at about ${setting(plan.summary.swgPercent)} this week (about ${plan.summary.swgNeedPpm?.toFixed(1)} ppm of chlorine a day).`
          : `The cell needs to make about ${plan.summary.swgNeedPpm?.toFixed(1)} ppm of chlorine a day.`,
      );
      // Heavy rain that takes salt below the chlorinator's range.
      const today = ctx.todays?.[alert.poolId];
      const wet = plan.days.find((d) => (!today || d.date >= today) && d.dilution?.saltLow);
      if (wet?.dilution?.salt) {
        lines.push(
          `Heavy rain on ${weekday(wet.date)} may take salt down to about ${wet.dilution.salt.toLocaleString("en-US")} ppm, below what your chlorinator asks for: test salt after it.`,
        );
      }
    } else {
      // The nightly plan can start yesterday in the pool's time zone (it runs at 06:00 UTC).
      const today = ctx.todays?.[alert.poolId];
      for (const d of plan.days.filter((x) => !today || x.date >= today).slice(0, 7)) {
        const add = addLabel(d.addMl, ctx.units);
        lines.push(`${weekday(d.date)}: ${add ? `add ${add} of liquid chlorine` : "nothing to add"}${d.algaeRisk ? " (watch: may run low)" : ""}${d.dilution ? " (heavy rain: retest stabilizer, calcium, salt after)" : ""}`);
      }
    }
  } else {
    lines.push("No plan yet: log a test with free chlorine to get one.");
  }
  return { title: `${alert.poolName}: the week ahead`, lines, link: poolUrl };
}

export function renderAlertEmail(alerts: DueAlert[], ctx: EmailContext): RenderedEmail {
  const sections = alerts.map((a) => section(a, ctx));
  const subject =
    sections.length === 1
      ? sections[0].title
      : `Tuffo: ${sections.length} things for your ${new Set(alerts.map((a) => a.poolId)).size > 1 ? "pools" : "pool"} today`;
  const manage = `${ctx.siteUrl}/app/account#alerts`;
  const footer = [
    "Tuffo advises; you decide.",
    `Change these emails: ${manage}`,
    `Stop all Tuffo alert emails: ${ctx.unsubscribeUrl}`,
  ];

  const text = [
    ...sections.flatMap((s) => [s.title, ...s.lines, s.link, ""]),
    "--",
    ...footer,
  ].join("\n");

  const html = [
    `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0b2e4f;line-height:1.5;max-width:560px;margin:0 auto;padding:16px">`,
    ...sections.map(
      (s) =>
        `<h2 style="font-size:18px;margin:16px 0 4px">${escape(s.title)}</h2>${s.lines
          .map((l) => `<p style="margin:4px 0">${escape(l)}</p>`)
          .join("")}<p style="margin:8px 0"><a href="${escape(s.link)}" style="color:#0e7c9e">Open in Tuffo</a></p>`,
    ),
    `<hr style="border:none;border-top:1px solid #d7e3ea;margin:24px 0 8px">`,
    `<p style="font-size:12px;color:#5b7083">Tuffo advises; you decide. <a href="${escape(manage)}" style="color:#5b7083">Change these emails</a> · <a href="${escape(ctx.unsubscribeUrl)}" style="color:#5b7083">Stop all alert emails</a></p>`,
    `</body></html>`,
  ].join("");

  return { subject, text, html };
}
