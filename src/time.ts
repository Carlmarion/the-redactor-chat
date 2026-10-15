// The client works in Amsterdam time (brief). Every timestamp we write carries its offset,
// so "+02:00" in summer and "+01:00" in winter, and compares correctly with the feed's.

const ZONE = "Europe/Amsterdam";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** ISO 8601 in Amsterdam time with milliseconds and offset, e.g. 2026-10-15T10:12:03.204+02:00. */
export function amsterdamIso(date: Date = new Date()): string {
  const p = Object.fromEntries(parts.formatToParts(date).map(({ type, value }) => [type, value]));
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  const local = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const offsetMinutes = Math.round((Date.parse(`${local}.${ms}Z`) - date.getTime()) / 60000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${local}.${ms}${offset}`;
}
