import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Content invariants: site.ts is the single source of truth for copy, chain
// constants, and trust wording. These guards keep the load-bearing facts
// (canonical endpoints, chain ID, non-affiliation core) and the composition
// rules (pages import copy, Disclaimer everywhere, no bdagscan links) intact.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const path = (rel) => new URL(rel, import.meta.url).pathname;

const site = read("../src/lib/content/site.ts");
const newsSeed = read("../src/lib/content/news-seed.ts");
const projectsSeed = read("../src/lib/content/projects-seed.ts");

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|css)$/.test(e.name) ? [p] : [];
  });
}

test("copy carries no prose semicolons", () => {
  // House style rule (2026-08-13): no semicolons in prose. Restructure
  // with commas, periods, or conjunctions instead. The sweep looks at long
  // single-line double-quoted strings (40+ chars) in the two copy sources,
  // which is where prose lives; code and comments keep their semicolons.
  for (const [name, source] of [
    ["site.ts", site],
    ["news-seed.ts", newsSeed],
    ["projects-seed.ts", projectsSeed],
  ]) {
    const strings = source.match(/"(?:[^"\\\n]|\\.){40,}"/g) ?? [];
    const offending = strings.filter((s) => /; /.test(s));
    assert.deepEqual(
      offending,
      [],
      `${name} has prose semicolons: ${offending.map((s) => s.slice(0, 60)).join(" | ")}`,
    );
  }
});

test("starter articles use plain editorial punctuation and include the staking cover", () => {
  const proseStrings = newsSeed.match(/"(?:[^"\\\n]|\\.){40,}"/g) ?? [];
  assert.deepEqual(
    proseStrings.filter((value) => value.includes("—")),
    [],
    "starter article prose must not contain em dashes",
  );
  assert.match(newsSeed, /imageUrl: "\/news-staking\.png"/);
  assert.match(
    newsSeed,
    /imageAlt: "Stacked digital coins illuminated by a violet beam in a dark hall\."/,
  );
  assert.ok(
    existsSync(path("../public/news-staking.png")),
    "the staking cover must be present in the public asset directory",
  );
});

test("NON_AFFILIATION carries the exact family trust core", () => {
  assert.match(
    site,
    /not affiliated with the team or parties that ran previous BDAG presales/,
    "The non-affiliation core sentence must not be reworded.",
  );
});

test("canonical endpoints and chain constants are intact", () => {
  assert.match(site, /https:\/\/rpc\.blockdag\.engineering/);
  assert.match(site, /https:\/\/explorer\.blockdag\.engineering/);
  assert.match(site, /chainId: 1404/, "CHAIN.chainId must stay 1404.");
  assert.match(
    site,
    /genesisIso: "2026-02-10T/,
    "Genesis date is verified on-chain (10 Feb 2026) and must not drift.",
  );
});

test("staking copy defers exit timing and custody mechanics to the contract", () => {
  const staking = site.slice(
    site.indexOf("export const STAKING_PAGE"),
    site.indexOf("} as const;", site.indexOf("export const STAKING_PAGE")),
  );
  for (const promise of [
    /only you can unstake it/i,
    /unstake whenever you choose/i,
    /stays under your keys/i,
  ]) {
    assert.doesNotMatch(
      staking,
      promise,
      "the live staking contract applies lifecycle and cooldown rules; the site must not imply instant exit or wallet custody.",
    );
  }
  assert.match(staking, /lifecycle/i);
  assert.match(staking, /cooldown/i);
});

test("community copy makes no unverified geographic reach claim", () => {
  const community = site.slice(
    site.indexOf("export const COMMUNITY_PAGE"),
    site.indexOf("} as const;", site.indexOf("export const COMMUNITY_PAGE")),
  );
  assert.doesNotMatch(
    community,
    /operators on (?:\w+|\d+) continents/i,
    "geographic reach needs a maintained source; the public node probe does not establish operator location.",
  );
});

test("the Genesis seed article makes no unmeasured uptime claim", () => {
  for (const claim of [
    /Six months from Genesis/,
    /never stopped/i,
    /did not miss a beat/i,
    /Every one of them was mined by community hardware/i,
  ]) {
    assert.doesNotMatch(newsSeed, claim);
  }
  assert.match(newsSeed, /BlockDAG Mainnet since Genesis/);
});

test("the exchange seed article treats chain ID as necessary but insufficient", () => {
  assert.doesNotMatch(newsSeed, /one check protects you and your users/i);
  assert.doesNotMatch(newsSeed, /one eth_chainId call/i);
  assert.match(newsSeed, /necessary but not sufficient/i);
  assert.match(newsSeed, /block hashes/i);
});

test("the mining seed article avoids unsupported hardware and RPC setup claims", () => {
  for (const claim of [
    /living room/i,
    /serious hashrate/i,
    /flagship/i,
    /point it at the canonical network/i,
  ]) {
    assert.doesNotMatch(newsSeed, claim);
  }
  assert.match(newsSeed, /Stratum/i);
});

test("the staking seed article defers custody and exits to contract state", () => {
  assert.doesNotMatch(newsSeed, /security without hardware/i);
  assert.doesNotMatch(newsSeed, /only you can unstake/i);
  assert.match(newsSeed, /wallet-signed/i);
  assert.match(newsSeed, /cooldown/i);
});

test("seed article descriptions fit search-result metadata", () => {
  const descriptions = [...newsSeed.matchAll(/description:\s*\n?\s*"([^"]*)"/g)].map(
    ([, description]) => description,
  );
  assert.equal(descriptions.length, 4);
  for (const description of descriptions) {
    assert.ok(
      description.length <= 160,
      `seed description is ${description.length} characters; keep it at 160 or fewer.`,
    );
  }
});

test("NAV_LINKS lists every route", () => {
  const block = site.slice(
    site.indexOf("export const NAV_LINKS"),
    site.indexOf("] as const;", site.indexOf("export const NAV_LINKS")),
  );
  for (const href of ["/", "/community", "/mining", "/staking", "/articles", "/faq", "/contact"]) {
    assert.ok(
      block.includes(`href: "${href}"`),
      `NAV_LINKS must include the ${href} route.`,
    );
  }

  // The chrome must not drift from NAV_LINKS: the footer's hand-kept columns
  // and the mobile drawer's icon map each cover every route, because a route
  // missing from either fails silently (the drawer falls back to a chevron,
  // the footer just omits the page).
  const footer = read("../src/components/site/Footer.tsx");
  const drawer = read("../src/components/site/MobileMenu.tsx");
  const hrefs = [...block.matchAll(/href: "([^"]+)"/g)].map(([, h]) => h);
  for (const href of hrefs) {
    assert.ok(
      footer.includes(`href="${href}"`) || footer.includes(`href: "${href}"`),
      `Footer.tsx must link ${href}; its columns are a second hand-kept list.`,
    );
    assert.ok(
      drawer.includes(`"${href}":`),
      `MobileMenu.tsx NAV_ICON must map ${href}, or the row falls back to a chevron.`,
    );
  }
});

test("the FAQ answers stay inside the site's own claims", () => {
  const start = site.indexOf("export const FAQ_PAGE");
  const copy = site.slice(start, site.indexOf("} as const;", start));
  const page = read("../src/app/(public)/faq/page.tsx");

  // The safety rule is stated reader-side: mining needs a public payout
  // address and never key material. This line is the FAQ's whole reason to
  // mention mining at all.
  assert.match(copy, /never a seed phrase or a private key/i);
  // The two-chains answer points at evidence rather than asking for trust,
  // and never links the fork.
  assert.match(copy, /chain ID 1404/);
  assert.match(copy, /href: "\/chain#nodes"/);
  assert.doesNotMatch(copy, /bdagscan/i);
  // No fixed-return language and no venue endorsements.
  assert.match(copy, /variable/i);
  assert.match(copy, /does not endorse venues/i);
  // The staking answer agrees with the staking page: the current platform is
  // reachable but not recommended, and the claiming issue is named.
  assert.match(copy, /do not recommend staking on it/i);
  assert.match(copy, /claiming/i);
  // Every answer ends at the page that evidences it, as the intro promises.
  const questions = (copy.match(/q: "/g) ?? []).length;
  const links = (copy.match(/more: \{/g) ?? []).length;
  assert.ok(questions >= 8, "the FAQ answers the recurring questions");
  assert.equal(questions, links, "every answer ends at an evidence link");
  // Native disclosure, no client bundle: a server component whose open state
  // lives on the <details> element itself.
  assert.match(page, /<details/);
  assert.match(page, /<summary/);
  assert.doesNotMatch(page, /"use client"/);

  // Every anchored evidence link must land on a real id. A renamed section
  // id would otherwise silently send FAQ readers to the top of the page.
  const anchors = [...copy.matchAll(/href: "\/[^"#]*#([^"]+)"/g)].map(
    ([, id]) => id,
  );
  assert.ok(anchors.length >= 4, "the FAQ links into page sections");
  const sources = sourceFiles(path("../src"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  for (const id of anchors) {
    const anchored =
      sources.includes(`id="${id}"`) ||
      // ExchangeWarning's heading takes its id from a const so the card and
      // its aria-labelledby cannot drift; the const's value is the anchor.
      sources.includes(`TITLE_ID = "${id}"`);
    assert.ok(anchored, `no element in src/ carries id="${id}"`);
  }
});

test("every (public) page imports its copy from site.ts or news.ts", () => {
  const pages = sourceFiles(path("../src/app/(public)")).filter((f) =>
    f.endsWith("page.tsx"),
  );
  assert.ok(
    pages.length >= 9,
    `expected at least the 9 public page files (found ${pages.length})`,
  );
  for (const page of pages) {
    const src = readFileSync(page, "utf8");
    assert.ok(
      src.includes('from "@/lib/content/site"') || src.includes('from "@/lib/news"'),
      `${page} must import from @/lib/content/site or @/lib/news — never re-author copy.`,
    );
  }
});

test("the Disclaimer renders on every public surface", () => {
  const surfaces = [
    "../src/app/(public)/page.tsx",
    "../src/app/(public)/chain/page.tsx",
    "../src/app/(public)/community/page.tsx",
    "../src/app/(public)/mining/page.tsx",
    "../src/app/(public)/staking/page.tsx",
    "../src/app/(public)/contact/page.tsx",
    // /news was omitted from this list for as long as the page it names had no
    // disclaimer — the test was written around the gap instead of failing on
    // it. Both are closed: the index renders it like every other surface.
    "../src/app/(public)/articles/page.tsx",
    "../src/app/(public)/faq/page.tsx",
    "../src/app/(public)/articles/submit/page.tsx",
    "../src/app/(public)/articles/[slug]/page.tsx",
    "../src/app/(public)/community/projects/page.tsx",
    "../src/app/(public)/community/projects/submit/page.tsx",
  ];
  for (const rel of surfaces) {
    const src = read(rel);
    assert.ok(
      src.includes("<Disclaimer") &&
        src.includes('from "@/components/site/Disclaimer"'),
      `${rel} must render the shared <Disclaimer> component.`,
    );
  }
});

test("every in-page disclaimer uses the home banner treatment", () => {
  const surfaces = [
    "../src/app/(public)/page.tsx",
    "../src/app/(public)/chain/page.tsx",
    "../src/app/(public)/community/page.tsx",
    "../src/app/(public)/mining/page.tsx",
    "../src/app/(public)/staking/page.tsx",
    "../src/app/(public)/contact/page.tsx",
    "../src/app/(public)/articles/page.tsx",
    "../src/app/(public)/faq/page.tsx",
    "../src/app/(public)/articles/submit/page.tsx",
    "../src/app/(public)/articles/[slug]/page.tsx",
    "../src/app/(public)/community/projects/page.tsx",
    "../src/app/(public)/community/projects/submit/page.tsx",
  ];

  for (const rel of surfaces) {
    const src = read(rel);
    assert.match(
      src,
      /<Disclaimer variant="banner" \/>/,
      `${rel} must use the same prominent disclaimer treatment as Home.`,
    );
    assert.doesNotMatch(
      src,
      /<div className="border-t border-border\/60 pt-6">\s*<Disclaimer/,
      `${rel} must not add the retired inline divider around the banner.`,
    );
  }

  const component = read("../src/components/site/Disclaimer.tsx");
  assert.doesNotMatch(
    component,
    /"inline"/,
    "the retired inline variant must not remain available for future pages",
  );
});

test("article bylines follow provenance and sharing stays SDK-free", () => {
  const page = read("../src/app/(public)/articles/[slug]/page.tsx");
  const share = read("../src/components/news/ShareRow.tsx");
  const news = read("../src/lib/news.ts");

  // The byline branches on the moderation column, not on the presence of a
  // name: an admin article with a byline must not read as a community
  // submission, and a nameless community submission must not read as admin.
  assert.match(news, /submitted_by_community/);
  assert.match(page, /article\.submittedByCommunity \?/);
  assert.match(page, /publishedByCommunity\b/);
  assert.match(page, /publishedByAdmin\b/);
  assert.doesNotMatch(page, /writtenBy/, "the old unconditional byline is gone");

  // Sharing is plain intent links: no social SDK ever loads on the article.
  // Comment-stripped before matching, so prose ABOUT SDKs cannot trip it.
  assert.match(page, /<ShareRow/);
  const shareCode = share.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(shareCode, /<script|sdk|widgets\.js/i);
  assert.match(share, /encodeURIComponent\(articleUrl\)/);
  assert.match(share, /encodeURIComponent\(title\)/);
  assert.match(share, /rel="noopener noreferrer"/);
  assert.match(share, /new URL\(`\/articles\/\$\{slug\}`, SITE\.url\)/,
    "share links must carry the canonical absolute URL");
});

test("the supplied community channels are live; the others stay coming-soon", () => {
  const start = site.indexOf("export const CHANNELS");
  const block = site.slice(start, site.indexOf("] as const;", start))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const entry = (name) => {
    const at = block.indexOf(`name: "${name}"`);
    assert.ok(at >= 0, `channel ${name} must exist`);
    return block.slice(at, block.indexOf("},", at));
  };
  // The public community group (handle updated 2026-09-28) plus the original
  // 2026-08-13 invite, which now serves the dedicated mining channel. Retired
  // community handles must not survive anywhere in the block.
  assert.match(entry("Telegram"), /url: "https:\/\/t\.me\/BDAG_COMMUNITY_GROUP"/);
  assert.match(entry("Telegram"), /mock: false/);
  assert.match(
    entry("Telegram (Mining)"),
    /url: "https:\/\/t\.me\/\+XTBIEkYZ1is5Zjg5"/,
  );
  assert.match(entry("Telegram (Mining)"), /mock: false/);
  assert.doesNotMatch(block, /name: "Reddit"|reddit\.com/,
    "Reddit stays hidden until verification is complete");
  // The official BlockDAG Network company page supplied by the owner
  // (2026-09-17). The URL is LinkedIn, so it is labelled LinkedIn rather than
  // Telegram even though the request called it a Telegram group.
  assert.match(
    entry("LinkedIn"),
    /url: "https:\/\/www\.linkedin\.com\/company\/blockdag-network\/"/,
  );
  assert.match(entry("LinkedIn"), /mock: false/);
  assert.match(entry("YouTube"), /url: "https:\/\/www\.youtube\.com\/@BDAGCommunity"/);
  assert.match(entry("YouTube"), /mock: false/);
  assert.match(entry("X (Twitter)"), /url: "https:\/\/x\.com\/1Bdag_Community"/);
  assert.match(entry("X (Twitter)"), /mock: false/);
  assert.doesNotMatch(block, /t\.me\/bdagcommunity\b/, "placeholder invite gone");
  assert.doesNotMatch(block, /t\.me\/BdagCommunityGroup/, "retired community handle gone");
  // Coming soon means NO handle and NO url in the data at all: the old
  // placeholder strings (an unowned discord.gg slug, an unregistered X
  // handle) were fake data one rendering bug away from publication. A
  // channel goes live by gaining both fields and flipping mock: false.
  for (const name of ["Discord"]) {
    const e = entry(name);
    assert.match(e, /mock: true/, `${name} must stay coming-soon`);
    assert.doesNotMatch(e, /url:/, `${name} must not carry a URL until real`);
    assert.doesNotMatch(
      e,
      /handle:/,
      `${name} must not carry a placeholder handle`,
    );
  }
  assert.match(entry("GitHub"), /url: COMMUNITY_GITHUB_URL/);
  assert.match(entry("GitHub"), /mock: false/);
  // The visible label is exactly "Coming soon" (2026-08-13), and the full
  // card must not also render a handle line saying it a second time.
  assert.match(site, /channelMockChip: "Coming soon"/);
  const card = read("../src/components/community/ChannelCard.tsx");
  assert.match(card, /channel\.mock \? null/, "mock full cards render no handle line");
});

test("public pools and explorers list the community directory", () => {
  // From the community resource directory: four pools on /mining, plus two
  // explorers and two mining sites on /community. The public RPC directory
  // is a separate live-checked list shared by Community and Mining.
  const miningCopy = site.slice(
    site.indexOf("export const MINING_PAGE"),
    site.indexOf("} as const;", site.indexOf("export const MINING_PAGE")),
  );
  for (const endpoint of [
    "stratum+tcp://east.bdag-us.org:3334",
    "stratum+tcp://west.bdag-us.org:3334",
    "stratum+tcp://pool.capedag.com:3334",
    "stratum+tcp://stratum.welshdag.trade:3334",
  ]) {
    assert.ok(miningCopy.includes(endpoint), `missing pool ${endpoint}`);
  }
  // A Stratum endpoint is a miner's scheme, not a browser's: the page
  // renders it copyable, never as a link.
  const miningPage = read("../src/app/(public)/mining/page.tsx");
  assert.match(miningPage, /infrastructure\.miningPools\.map/);
  assert.doesNotMatch(
    miningPage,
    /href=\{pool/,
    "pool endpoints must render as CopyRef text, not links",
  );

  const communityCopy = site.slice(
    site.indexOf("export const COMMUNITY_PAGE"),
    site.indexOf("} as const;", site.indexOf("export const COMMUNITY_PAGE")),
  );
  // Public explorers on the community page must all be verified working. The
  // BDAG-US "explore.*" subdomains we first listed do not resolve (DNS-gone),
  // so they were removed 2026-08-14 in favour of the working odinsexplorer.app.
  // RMS ChainPulse joined 2026-08-17, verified reachable the same day.
  assert.ok(
    communityCopy.includes("https://odinsexplorer.app"),
    "missing the working community explorer (odinsexplorer.app)",
  );
  assert.ok(
    communityCopy.includes("https://rms-bdag-rpc.de/"),
    "missing the working community explorer (RMS ChainPulse)",
  );
  assert.ok(
    communityCopy.includes("https://explorer.bdagexplorer.com/"),
    "missing the BDAG Explorer community explorer",
  );
  for (const dead of [
    "https://explore.east.bdag-us.org",
    "https://explore.west.bdag-us.org",
  ]) {
    assert.ok(!communityCopy.includes(dead), `dead explorer must not return: ${dead}`);
  }
  const communityPage = read("../src/app/(public)/community/page.tsx");
  assert.match(communityPage, /infrastructure\.explorers\.map/);
  assert.match(
    communityPage,
    /infrastructure\.explorers[\s\S]{0,600}rel="noopener noreferrer"/,
    "explorer links are external and must carry the rel guard",
  );
  assert.match(
    site,
    /id: "bdagexplorer"[\s\S]*name: "rpc\.bdagexplorer\.com"[\s\S]*host: "rpc\.bdagexplorer\.com"[\s\S]*role: "community"/,
    "missing the verified BDAG Explorer public RPC",
  );
  assert.ok(
    communityCopy.includes("https://welshdag.trade/"),
    "missing the WelshDAG public mining directory",
  );
  assert.ok(
    communityCopy.includes("https://capedag.com"),
    "missing the CapeDAG public mining site",
  );
  assert.match(communityPage, /infrastructure\.communityPools\.map/);
  assert.match(
    communityPage,
    /infrastructure\.communityPools[\s\S]{0,600}rel="noopener noreferrer"/,
    "public mining links are external and must carry the rel guard",
  );
});

test("bdagscan.com is never linked — warning copy only", () => {
  for (const file of sourceFiles(path("../src"))) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("bdagscan.com")) continue;
    // The string may only appear as prose inside the two warning-copy sources.
    assert.ok(
      file.endsWith("/lib/content/site.ts") ||
        file.endsWith("/lib/content/news-seed.ts"),
      `bdagscan.com may only appear in site.ts / news-seed.ts warning copy (found in ${file}).`,
    );
    // And never as a URL/href, even there.
    assert.doesNotMatch(
      src,
      /https?:\/\/[^\s"'`]*bdagscan\.com/,
      `${file} must never contain a bdagscan.com URL — the fork is named, never linked.`,
    );
    assert.doesNotMatch(src, /href[^\n]*bdagscan\.com/);
  }
});

test("the fork warning names the fork, never links it, and hands over a way out", () => {
  const w = site.slice(
    site.indexOf("export const EXCHANGE_WARNING"),
    site.indexOf("} as const;", site.indexOf("export const EXCHANGE_WARNING")),
  );
  // The material claim: not that a second endpoint exists, but that one party
  // controls what it serves and presents it as the network.
  assert.match(w, /centralised fork/i);
  assert.match(w, /rpc\.bdagscan\.com/, "the fork is named");
  assert.doesNotMatch(w, /https?:\/\/[^\s"'`]*bdagscan/, "and never given as a URL");

  // The whole technical argument, still there, in six words. Chain ID alone
  // is what fools people, so the contrast has to survive any rewrite.
  assert.match(w, /same chain ID, different block hashes/i);
  assert.match(w, /closed mining/i, "the fork's mining is not open");
  // …and so does the consequence, which is the part an exchange acts on.
  assert.match(w, /not on the canonical chain/i);

  // BREVITY IS THE CONTRACT. This card ran to three sentences plus three
  // bullets restating them plus two sentences of pinning advice, and the
  // people it is written for do not read that. Both ceilings are generous
  // against what is there now; they exist to stop it creeping back.
  const body = /body:\s*\n?\s*"([^"]+)"/.exec(w);
  assert.ok(body, "the warning must have a body");
  assert.ok(
    body[1].length <= 240,
    `the warning body must stay short (was ${body[1].length} chars)`,
  );
  assert.doesNotMatch(w, /observed:/, "no bullet list restating the body");
  assert.doesNotMatch(w, /canonicalNote:/, "pinning advice lives on /chain now");

  // The recommendation that costs us the dependency — shorter, but not one
  // benefit lighter: verify it yourself, stay in sync, no rate limit.
  const rec = /recommend:\s*\n?\s*"([^"]+)"/.exec(w);
  assert.ok(rec, "the recommendation must survive");
  assert.ok(
    rec[1].length <= 160,
    `the recommendation must stay short (was ${rec[1].length} chars)`,
  );
  assert.match(rec[1], /verify the chain yourself/i, "decentralised");
  assert.match(rec[1], /in sync/i, "synced");
  assert.match(rec[1], /unthrottled/i, "no rate limit");
  assert.match(w, /run your own node/i);
  assert.match(w, /recommendCta:\s*\{\s*label:[^}]*href:\s*"\/community#run-a-node"/);

  // All three values an integrator has to get right, each copyable.
  assert.match(w, /endpointsTitle: "Canonical endpoints"/);
  assert.match(w, /rpcLabel: "Public RPC"/);
  assert.match(w, /explorerLabel: "Explorer"/);
  const warningTsx = read("../src/components/home/ExchangeWarning.tsx");
  assert.equal(
    (warningTsx.match(/<CopyRef/g) ?? []).length,
    3,
    "RPC, explorer and chain ID are each copyable",
  );
  assert.match(warningTsx, /CHAIN\.explorerUrl/);

  // The recommendation is the point of the card, and says so.
  assert.match(w, /recommendBadge: "Recommended"/);

  // "View more" on its own is a link nobody can act on out of context, so the
  // accessible name is completed rather than left as two vague words. It
  // points at the node board, which is where the claim is evidenced.
  assert.match(w, /more:\s*\{[\s\S]*?href:\s*"\/chain#nodes"/);
  const warningSrc = read("../src/components/home/ExchangeWarning.tsx");
  assert.match(
    warningSrc,
    /<span className="sr-only">\s*\{EXCHANGE_WARNING\.more\.context\}\s*<\/span>/,
  );
});

test("the warning's way out actually lands somewhere", () => {
  // A cross-page anchor is the easiest thing on this site to break silently:
  // rename the section and the recommendation quietly scrolls to the top of
  // Community instead. Both halves are asserted together, on purpose.
  const href = /href:\s*"(\/community#[a-z-]+)"/.exec(
    site.slice(site.indexOf("recommendCta")),
  );
  assert.ok(href, "the recommendation must carry a concrete href");
  const anchor = href[1].split("#")[1];

  const community = read("../src/app/(public)/community/page.tsx");
  assert.ok(
    community.includes(`id="${anchor}"`),
    `Community must carry id="${anchor}" for the fork warning to land on`,
  );
  assert.match(community, /scroll-mt-24/, "and clear the sticky header");

  // The second cross-page link, checked the same way: "View more" points at
  // the node board, and a renamed section would send it to the top of /chain.
  const moreHref = /more:\s*\{[\s\S]*?href:\s*"\/chain#([a-z-]+)"/.exec(site);
  assert.ok(moreHref, "the View more link must carry a concrete anchor");
  const chainPage = read("../src/app/(public)/chain/page.tsx");
  assert.ok(
    chainPage.includes(`id="${moreHref[1]}"`),
    `The Chain must carry id="${moreHref[1]}" for View more to land on`,
  );

  const warning = read("../src/components/home/ExchangeWarning.tsx");
  assert.match(warning, /EXCHANGE_WARNING\.recommendCta\.href/);
  // Both placements carry it: an exchange reading /chain must get the same
  // recommendation as one reading home, so it sits outside the isFull branch.
  const tail = warning.slice(warning.indexOf("recommendTitle"));
  assert.doesNotMatch(
    tail.slice(0, tail.indexOf("</div>")),
    /isFull \?\s*<|\{isFull \? \(/,
    "the recommendation must not be gated to one variant",
  );
});

/** The exact extent of a nested object literal, by brace matching. The old
 *  slice ran from `runNode: {` to the next `} as const;`, which swallowed
 *  every key after it — fine for a substring match, useless for asserting
 *  that something is ABSENT. */
function objectAt(source, key) {
  const start = source.indexOf(key);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return "";
}

test("run a node is instructions, in the order you do them", () => {
  const n = objectAt(site, "runNode: {");
  assert.ok(n.length > 400, "the runNode block must be findable");

  // The two long question-and-answer cards are gone; they are becoming
  // articles. What is left is three steps.
  assert.doesNotMatch(n, /questions:/, "the Q&A cards are not part of this section");
  assert.doesNotMatch(n, /Why trust the community/i);
  assert.doesNotMatch(n, /What does decentralisation actually mean/i);
  assert.match(n, /steps: \[/);
  assert.deepEqual(
    [...n.matchAll(/n: "(\d\d)"/g)].map((m) => m[1]),
    ["01", "02", "03"],
    "three steps, numbered in order",
  );

  // House style, and the reason this test exists: no em dashes in the copy.
  const copyOnly = n
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");
  assert.doesNotMatch(copyOnly, /—/, "no em dashes in this section's copy");

  // Hardware, including the one spec that decides whether it works at all.
  assert.match(n, /Intel i3 or i5/);
  assert.match(n, /16 GB DDR3/);
  assert.match(n, /256 GB SSD or NVMe/);
  assert.match(n, /spinning disk/i, "the storage caveat is the useful part");

  const community = read("../src/app/(public)/community/page.tsx");
  assert.match(community, /href=\{COMMUNITY_PAGE\.runNode\.release\.href\}/);
  assert.match(objectAt(n, "release: {"), /href: RELEASES_PAGE\.href/);
  assert.doesNotMatch(n, /rc\.\d+/, "no release version may be written into copy");
  assert.match(community, /getLatestRelease\(\)/);
  assert.match(community, /\{release\.version\}/);

  // Each attachment sits INSIDE the step that needs it. The old layout put the
  // release link in one card and then told the reader to "copy the release
  // link above" from another, which is an instruction that points at the page
  // rather than at the task.
  assert.doesNotMatch(n, /link above/i, "no step may cross-reference another");
  assert.match(community, /index === 0 \?/, "hardware belongs to step one");
  assert.match(community, /index === 1 \?/, "the release link belongs to step two");
});

test("the release page is discoverable without changing the primary navigation", () => {
  const page = read("../src/app/(public)/releases/page.tsx");
  const footer = read("../src/components/site/Footer.tsx");
  const sitemap = read("../src/app/sitemap.ts");
  assert.match(page, /getLatestRelease\(\)/);
  assert.match(page, /getReleaseHistory\(\)/);
  assert.match(page, /copy\.unavailable/);
  assert.match(footer, /href: RELEASES_PAGE\.href/);
  assert.match(sitemap, /new URL\(RELEASES_PAGE\.href, SITE\.url\)/);
  assert.doesNotMatch(site, /blockdagengineering\.github\.io\/bdag-ipfs-release-page/);
});

test("a copy button that cannot use the Clipboard API still copies", () => {
  const util = read("../src/lib/utils/copy.ts");

  // navigator.clipboard is UNDEFINED on any plain-HTTP origin that is not
  // localhost, and writeText rejects outright when the document is not
  // focused. Both are ordinary conditions, so both need a path that works.
  assert.match(util, /navigator\.clipboard\?\.writeText/, "guarded, not assumed");
  assert.match(util, /document\.execCommand\("copy"\)/, "legacy path exists");
  assert.match(util, /Promise<boolean>/, "the caller is told whether it worked");

  // Copying must not destroy whatever the reader had selected.
  assert.match(util, /getRangeAt\(0\)/);
  assert.match(util, /selection\.addRange\(previous\)/);
  // …and the off-screen field must not summon a keyboard or move the page.
  assert.match(util, /field\.readOnly = true/);
  assert.match(util, /position:fixed/);
  assert.match(util, /field\.remove\(\)/, "the field is always cleaned up");

  for (const rel of [
    "../src/components/ui/CopyRef.tsx",
    "../src/components/community/CopySnippet.tsx",
  ]) {
    const src = read(rel);
    // The original bug: `setCopied(true)` sat AFTER an awaited writeText whose
    // rejection was swallowed by an empty catch, so a failed copy was
    // indistinguishable from no click at all. Neither component may talk to
    // the clipboard directly again.
    assert.doesNotMatch(
      src,
      /navigator\.clipboard/,
      `${rel} must go through copyText, not the raw API`,
    );
    assert.doesNotMatch(src, /catch \{\s*\/\//, `${rel} must not swallow the failure`);
    assert.match(src, /if \(await copyText\(value\)\)/, `${rel} branches on success`);
    // And when both paths refuse, the value is selected so it can still be
    // taken with the keyboard.
    assert.match(src, /selectElementText\(/, `${rel} falls back to a selection`);
  }
});

test("the fork card's section labels are one register, not three", () => {
  const src = read("../src/components/home/ExchangeWarning.tsx");

  // The card makes one argument in three steps — what not to use, what to use
  // instead, what is better still — so its three labels have to look like
  // three steps rather than a heading and two unrelated sub-labels. Same
  // colour, same type, an icon in front of each.
  const labels = src.match(
    /className="label-caps flex(?: flex-wrap)? items-center gap-2 text-accent-teal"/g,
  );
  assert.equal(labels?.length, 3, "all three section labels share one register");

  // Distinct silhouettes at 16px: three variations on a shield would not read
  // apart, so the icons are a warning, a network and a machine.
  for (const icon of ["ShieldAlert", "Network", "Server"]) {
    assert.match(
      src,
      new RegExp(`<${icon}[\\s\\S]{0,120}?aria-hidden`),
      `${icon} must front one of the labels, and be decorative`,
    );
  }
  assert.match(src, /import \{ ArrowRight, Network, Server, ShieldAlert \}/);

  // Each is 16px, same weight, and never announced — the label beside it is
  // already the text.
  // One whitespace-tolerant pattern: prettier wraps some of these across
  // lines, and \s+ already spans a newline.
  assert.equal(
    (src.match(/className="size-4 shrink-0"\s+strokeWidth=\{1\.75\}/g) ?? []).length,
    3,
    "the three label icons share one size and weight",
  );
});

test("no em dash reaches the page", () => {
  // House style. The em dash was this copy's most-used punctuation mark and
  // its most obvious tell: 13 of them across the site's rendered strings,
  // almost all standing in for a comma, a full stop or a colon that would
  // have been clearer. Comments are exempt, so a note can still explain the
  // rule (and quote the mark) without tripping it.
  for (const rel of [
    "../src/lib/content/site.ts",
    "../src/lib/content/news-seed.ts",
    "../src/lib/content/projects-seed.ts",
  ]) {
    const copy = read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/[^\n]*$/gm, "");
    const strings = copy.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
    const offenders = strings.filter((s) => s.includes("—"));
    assert.deepEqual(
      offenders,
      [],
      `${rel} must not use an em dash in copy (${offenders.length} found)`,
    );
  }
});


test("the agent brief is generated, and never asks for a secret", () => {
  // The document is built in ONE place for two scopes, so the node brief and
  // the mining brief cannot drift on the safety rules or the network values.
  const route = read("../src/app/mining-onboarding.md/route.ts");
  const nodeRoute = read("../src/app/node-onboarding.md/route.ts");
  const lib = read("../src/lib/onboarding.ts");
  assert.match(route, /buildOnboarding\(release, "mining"\)/);
  assert.match(nodeRoute, /buildOnboarding\(release, "node"\)/);

  // GENERATED, not a file in public/. The endpoints, the chain ID and the
  // release version live in one place already; a static copy would be the one
  // document on this site quietly naming a superseded release.
  assert.match(lib, /import \{ CHAIN \}/);
  assert.match(route, /getLatestRelease/);
  assert.match(lib, /\$\{CHAIN\.rpcUrl\}/);
  assert.match(lib, /\$\{CHAIN\.chainId\}/);
  assert.doesNotMatch(lib, /2\.0\.0-community-rescue/, "no release version typed in");

  // Use the published release and its verified corresponding source for instructions.
  assert.match(lib, /only authority for install steps/i);
  assert.match(lib, /SHA-256 file/);
  assert.doesNotMatch(lib, /release-manifest\.json|manifest signature|ai-agent-runbook/);
  assert.doesNotMatch(lib, /docker run|apt-get|curl -[a-zA-Z]* https/, "no commands");

  // The safety rule, which the release page states too: mining needs a public
  // payout address and nothing else.
  assert.match(lib, /Never ask for, accept, store, log or transmit a seed phrase or a private\s+key/);
  assert.match(lib, /PUBLIC payout address/);
  // Everything the operator was asked to capture.
  for (const field of ["MAC address", "payout address", "Profile", "Release version"]) {
    assert.ok(lib.includes(field), `the worksheet must capture: ${field}`);
  }
  // The miner and the pool belong to the MINING scope only. A node operator
  // who never intends to mine must not be handed a worksheet asking for a MAC
  // address and a payout wallet.
  const nodeOnly = lib.slice(lib.indexOf('mining\n    ? `'), lib.indexOf(': ""'));
  assert.match(nodeOnly, /MAC address/, "the miner worksheet is inside the mining branch");
  assert.match(lib, /scope === "mining"/);
  assert.match(lib, /Running a node needs no key material at all/);
  // Next requires route segment config to be a static literal. `export const
  // revalidate = SOME_IMPORT` compiles fine and then fails the build at
  // "Collecting page data", which is easy to miss behind a green compile line.
  // The literal must stay equal to the shared constant.
  const revalidate = /export const revalidate = (\d+);/.exec(route);
  assert.ok(revalidate, "the route must declare revalidate as a literal");
  const shared = /RELEASE_REVALIDATE_SECONDS = (\d+)/.exec(
    read("../src/lib/releases.ts"),
  );
  assert.equal(
    revalidate[1],
    shared[1],
    "the literal revalidate must match RELEASE_REVALIDATE_SECONDS",
  );

  // Downloads rather than rendering, because it is meant to be handed over.
  assert.match(route, /content-disposition.*attachment; filename="mining-onboarding\.md"/);
  assert.match(route, /text\/markdown/);

  // The fork is not named here: this file is outside the two sources allowed
  // to mention it, and the bdagscan guard scans all of src/.
  assert.doesNotMatch(lib, /bdagscan/);

  // And the page offers it, with the safety line surfaced rather than buried.
  const n = objectAt(read("../src/lib/content/site.ts"), "runNode: {");
  const agent = objectAt(n, "agent: {");
  assert.match(agent, /Recommended: let an agent do it/);
  assert.match(agent, /never needs a seed phrase or a private key/i);
  // Community offers the NODE brief. The pool and the miner live on /mining.
  assert.match(agent, /node-onboarding\.md/);
  assert.doesNotMatch(agent, /mining-onboarding/);
  assert.doesNotMatch(n, /\bpool\b|\bminer\b/i, "run-a-node is node only");
  const community = read("../src/app/(public)/community/page.tsx");
  assert.match(community, /agent\.safety/, "the safety line renders on the page");
  assert.match(community, /download\n?\s/, "the button downloads");
});

test("staking leads with the coming replacement before it explains staking", () => {
  const page = read("../src/app/(public)/staking/page.tsx");
  const copy = objectAt(site, "export const STAKING_PAGE");

  // The status card comes BEFORE the mechanism is described, and since
  // 2026-08-13 it leads with the replacement: a new interface AND a new
  // contract, the exit from the previous version, and where the announcement
  // will land. Since 2026-08-17 the current platform is back online, so the
  // card also names it, warns against staking on it in the same paragraph as
  // the link, names the claiming issue rather than waving at "issues", and
  // says what it IS good for: an existing staker seeing their position.
  assert.match(copy, /status: \{/, "the status block must exist");
  assert.match(copy, /coming soon/i, "the new release has not shipped yet");
  assert.match(
    copy,
    /new contract/i,
    "the contract is new, not only the page",
  );
  assert.match(
    copy,
    /includes a way out/i,
    "the exit is attributed to the release, which can actually provide it",
  );
  assert.match(
    copy,
    /announce it here when it is ready/i,
    "the announcement channel is this site",
  );
  // The platform pins run against the status OBJECT, not the whole
  // STAKING_PAGE slice: the slice includes doc comments that also say
  // "claiming", and a whole-slice match would stay green if the phrase
  // drifted out of the card into any other section.
  const statusCopy = objectAt(copy, "status: {");
  assert.match(
    statusCopy,
    /staking\.blockdag\.engineering/,
    "the card names the current platform readers can reach",
  );
  assert.match(
    statusCopy,
    /do not recommend staking on it/i,
    "the caution lives in the status card itself",
  );
  assert.match(
    statusCopy,
    /claiming/i,
    "the known issue is named in the card, not waved at",
  );
  assert.match(
    statusCopy,
    /stake is not gone/i,
    "the card says what the platform IS good for today",
  );
  assert.ok(
    statusCopy.indexOf("do not recommend") <
      statusCopy.indexOf("platformCta"),
    "the warning is stated before the platform link is offered",
  );

  // Position is the point. It must come before the mechanism sections.
  const at = (needle) => page.indexOf(needle);
  assert.ok(at('id="status-heading"') > 0, "the status block renders");
  assert.ok(
    at('id="status-heading"') < at('id="honest-heading"'),
    "status must come before the candour section",
  );
  assert.ok(
    at('id="status-heading"') < at('id="how-heading"'),
    "status must come before How the contract works",
  );

  // …and the section that used to read as instructions now names whose
  // behaviour it describes, so it does not read as a to-do list.
  assert.match(copy, /title: "How the contract works"/);
  assert.doesNotMatch(copy, /title: "How it works"/);

  // The old bottom note is gone rather than duplicated.
  assert.doesNotMatch(copy, /\bnote:/, "the walkthrough note is folded into status");
  assert.doesNotMatch(page, /Staking walkthrough note/);

  // The reward mechanism itself is still stated as real, because it is.
  assert.match(copy, /lives entirely on chain/i);

  // Layout: the icon shares the heading row and the paragraphs return to the
  // card's left padding. The old markup hung every paragraph in a column
  // beside the icon, which indented the whole body under nothing. The guards
  // are scoped to the status section so an unrelated future use of the same
  // utilities elsewhere on the page cannot falsely trip them.
  const status = page.slice(
    page.indexOf('aria-labelledby="status-heading"'),
    page.indexOf('id="honest-heading"'),
  );
  assert.match(
    status,
    /id="status-heading"[\s\S]{0,240}Hourglass/,
    "the hourglass lives inside the heading row",
  );
  assert.doesNotMatch(
    status,
    /<div className="flex items-start gap-3(?![\w./-])/,
    "body copy no longer hangs in a column beside the icon",
  );
  // max-w-none is load-bearing, not decoration: .body and .body-sm bake a
  // 68ch measure in globals.css, so only an explicit override actually lets
  // the copy run the card's whole width (2026-08-13).
  assert.match(status, /className="body max-w-none"/);
  assert.match(status, /className="body-sm max-w-none"/);
  // The new-stance payload actually RENDERS: the platform paragraph at body
  // size and the platform link in the card's button row. Without these, the
  // copy pins above stay green while the page silently drops both.
  assert.match(
    status,
    /className="body max-w-none">\{STAKING_PAGE\.status\.current\}/,
    "the platform caution paragraph renders at body size",
  );
  assert.match(
    status,
    /STAKING_PAGE\.status\.platformCta\.url/,
    "the platform link renders in the status card",
  );
});
