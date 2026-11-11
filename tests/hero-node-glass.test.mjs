import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const heroNode = readFileSync(
  new URL("../src/components/home/HeroNode.tsx", import.meta.url),
  "utf8",
);

test("the hero node exposes a layered circular glass shell", () => {
  assert.match(heroNode, /className="[^"]*hero-node-glass[^"]*"/);
  assert.match(heroNode, /className="[^"]*hero-node-energy[^"]*"/);
  assert.match(heroNode, /className="[^"]*hero-node-specular[^"]*"/);
  assert.match(heroNode, /className="[^"]*hero-node-mark[^"]*"/);
});

test("the glass node crops the official logo mark as decoration", () => {
  assert.match(heroNode, /<img[\s\S]*?src="\/logo\.svg"/);
  assert.match(heroNode, /<img[\s\S]*?alt=""[\s\S]*?aria-hidden/);
  assert.match(heroNode, /className="[^"]*hero-node-mark-source[^"]*"/);
});

test("the glass treatment preserves the existing accessible hollow block", () => {
  assert.match(heroNode, /href=\{HERO\.scrollCue\.href\}/);
  assert.match(heroNode, /aria-label=\{HERO\.scrollCue\.label\}/);
  assert.match(heroNode, /focus-visible:ring-accent/);
  assert.match(heroNode, /className="hero-ring"/);
  assert.match(heroNode, /className="hero-arc hero-arc-soft"/);
  assert.match(heroNode, /className="hero-arc hero-arc-teal"/);
  assert.match(heroNode, /fill="none"/, "the perimeter must remain hollow");
  assert.doesNotMatch(heroNode, /\b(?:useEffect|useState)\b/);
});

test("the node exposes a live output port after its fill completes", () => {
  assert.match(heroNode, /className="hero-output-port"/);
});
