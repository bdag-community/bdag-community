import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const site = read("../src/lib/content/site.ts");
const seed = read("../src/lib/content/news-seed.ts");

test("fork warnings stay on verifiable chain divergence", () => {
  const publicCopy = site + "\n" + seed;
  for (const unsupported of [
    /serious suspicious behaviour/i,
    /funds extracted from staking contracts/i,
    /resale and compression of tokens/i,
    /token resale/i,
    /token dumping/i,
    /protect the network and its holders/i,
  ]) {
    assert.doesNotMatch(publicCopy, unsupported);
  }

  assert.match(publicCopy, /chain ID 1404[^.]*not sufficient/i);
  assert.match(publicCopy, /block hashes diverge/i);
});

test("the timeline does not turn a point-in-time reading into an uptime claim", () => {
  const timeline = site.slice(
    site.indexOf("export const TIMELINE"),
    site.indexOf("} as const;", site.indexOf("export const TIMELINE_SECTION")),
  );
  assert.doesNotMatch(timeline, /kept it alive since Genesis/i);
  assert.doesNotMatch(timeline, /about one block every second/i);
  assert.match(timeline, /live readings/i);
});

test("timeline dates are exact, so no event is marked approximate", () => {
  const events = site.slice(
    site.indexOf("export const TIMELINE:"),
    site.indexOf("] as const;", site.indexOf("export const TIMELINE:")),
  );
  // Confirmed to exact days on 2026-08-13. If a future date is only an
  // estimate, set approx: true AND restore the legend copy together.
  assert.doesNotMatch(events, /approx: true/, "every event carries a confirmed date");
  assert.doesNotMatch(site, /approxNote/, "the approximate-date legend is retired");
  const timelineComponent = read(
    "../src/components/home/Timeline.tsx",
  );
  assert.doesNotMatch(
    timelineComponent,
    /TIMELINE_SECTION\.approxNote/,
    "the legend must not render while all dates are exact",
  );
});
