import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Braces, Coins, FlaskConical, Network } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyRef } from "@/components/ui/CopyRef";
import { PageHero } from "@/components/site/PageHero";
import { TestnetFaucet } from "@/components/testnet/TestnetFaucet";
import { AddTestnetNetwork } from "@/components/testnet/AddTestnetNetwork";
import { TESTNET as copy } from "@/lib/content/site";

export const metadata: Metadata = { title: copy.title, description: copy.description };

function TestnetArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid"><path d="M74 100h68l38 60h68M74 220h68l38-60M160 54v50M160 216v50" /><circle cx="160" cy="160" r="108" strokeDasharray="3 9" /></g>
      <path className="page-hero-art-flow" d="M74 100h58l56 120h60M74 220h58l56-120h60" />
      <g className="page-hero-art-nodes">{[[74,100],[74,220],[160,160],[248,100],[248,220]].map(([x,y])=><rect key={`${x}-${y}`} x={x-16} y={y-16} width="32" height="32" rx="8" />)}</g>
    </svg>
  );
}

export default function TestnetPage() {
  const network = copy.network;
  const rows = [[copy.labels.name, network.name], [copy.labels.rpc, network.rpcUrl], [copy.labels.fallback, network.fallbackRpcUrl], [copy.labels.chain, String(network.chainId)], [copy.labels.currency, network.currency.symbol]];
  return (
    <>
      <Section as="section" aria-labelledby="testnet-title">
        <PageHero titleId="testnet-title" title={copy.title} subtitle={copy.subtitle} intro={copy.intro} art={<TestnetArt />} label="community testnet" />
        <div className="flex max-w-[76ch] items-start gap-3 rounded-xl border border-teal-soft/25 bg-teal-soft/5 p-4 sm:p-5"><FlaskConical className="mt-0.5 size-5 shrink-0 text-teal-soft" aria-hidden /><p className="text-sm leading-relaxed text-on-surface">{copy.notice}</p></div>
      </Section>

      <Section as="section" id="network" aria-labelledby="network-title" className="scroll-mt-24">
        <div className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div className="min-w-0"><p className="eyebrow">{copy.setup.eyebrow}</p><h2 id="network-title" className="h2 mt-3">{copy.setup.title}</h2><p className="body mt-5">{copy.setup.body}</p><div className="mt-6"><AddTestnetNetwork /></div><p className="body-sm mt-5">{copy.setup.explorer}</p></div>
          <Card className="min-w-0 p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3"><span className="label-caps">{network.name}</span><span className="shrink-0 rounded-full border border-teal-soft/25 bg-teal-soft/5 px-3 py-1 font-mono text-xs text-teal-soft">{network.chainIdHex}</span></div>
            <dl className="divide-y divide-border/60">{rows.map(([label,value])=><div key={label} className="min-w-0 py-4"><dt className="mb-2 text-xs text-on-surface-variant">{label}</dt><dd className="min-w-0"><CopyRef value={value} label={label} /></dd></div>)}</dl>
            <details className="mt-3 border-t border-border/60 pt-4"><summary className="focus-ring cursor-pointer rounded py-2 text-sm text-accent-soft">{copy.labels.fingerprint}</summary><dl className="mt-3 space-y-4">{[[copy.labels.nativeGenesis,network.nativeGenesis],[copy.labels.genesis,network.evmGenesis],[copy.labels.stateRoot,network.evmGenesisStateRoot]].map(([label,value])=><div key={label} className="min-w-0"><dt className="mb-2 text-xs text-on-surface-variant">{label}</dt><dd><CopyRef value={value} label={label} /></dd></div>)}</dl></details>
          </Card>
        </div>
      </Section>

      <Section as="section" id="faucet" aria-labelledby="faucet-title" className="scroll-mt-24">
        <div className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12"><div><p className="eyebrow">Get started</p><h2 id="faucet-title" className="h2 mt-3">A little test BDAG,<br/>a lot to try</h2><p className="body mt-5">Create a dedicated test wallet, add chain 1043, then request your free test funds. Use the same wallet for Staking, Development and Testnet apps.</p></div><Card className="min-w-0 p-6 sm:p-8"><TestnetFaucet/></Card></div>
      </Section>

      <Section as="section" id="platforms" aria-labelledby="platforms-title" className="scroll-mt-24">
        <h2 id="platforms-title" className="h2">{copy.platformsTitle}</h2><p className="lead mt-4">{copy.platformsIntro}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">{copy.platforms.map(platform=><Card key={platform.kind} className="flex min-w-0 flex-col p-6 sm:p-8"><div className="flex items-center gap-3 text-accent-soft">{platform.kind==='staking'?<Coins className="size-6" aria-hidden />:<Braces className="size-6" aria-hidden />}<p className="eyebrow">{platform.tag}</p></div><h3 className="h3 mt-5">{platform.title}</h3><p className="body-sm mt-4 flex-1">{platform.body}</p><p className="mt-5 border-t border-border/60 pt-4 text-xs leading-relaxed text-on-surface-variant">{platform.detail}</p><Button href={platform.href} target="_blank" rel="noopener noreferrer" variant="ghost" className="mt-6 self-start" trailingIcon={<ArrowUpRight className="size-4" aria-hidden />}>{platform.cta}</Button></Card>)}</div>
      </Section>

      <Section as="section" id="nodes" aria-labelledby="operators-title" className="scroll-mt-24">
        <div className="rounded-2xl border border-border p-6 sm:p-8"><div className="flex items-center gap-3"><Network className="size-6 text-accent-soft" aria-hidden/><h2 id="operators-title" className="h3">{copy.operators.title}</h2></div><p className="body mt-4 max-w-[80ch]">{copy.operators.body}</p><details className="mt-5"><summary className="focus-ring cursor-pointer text-sm text-accent-soft">Node setup and mining</summary><ol className="mt-5 grid gap-6 md:grid-cols-3">{copy.operators.steps.map((step,i)=><li key={step.title}><span className="font-mono text-xs text-teal-soft">0{i+1}</span><h3 className="h4 mt-2">{step.title}</h3><p className="body-sm mt-2">{step.body}</p></li>)}</ol><div className="mt-6 min-w-0 rounded-xl border border-border/70 bg-surface/40 p-4"><p className="mb-3 text-xs text-on-surface-variant">Public seed multiaddress</p><CopyRef value={copy.operators.publicSeed} label="Public seed multiaddress" /></div><p className="mt-5 text-xs leading-relaxed text-on-surface-variant">{copy.operators.note}</p><Button href={copy.operators.href} variant="ghost" className="mt-5" trailingIcon={<ArrowRight className="size-4" aria-hidden/>}>{copy.operators.cta}</Button></details></div>
      </Section>

      <Section as="section" aria-labelledby="feedback-title"><div className="rounded-2xl border border-accent/25 bg-accent/5 p-6 sm:p-8"><h2 id="feedback-title" className="h3">{copy.feedback.title}</h2><p className="body mt-4 max-w-[78ch]">{copy.feedback.body}</p><Button href={copy.feedback.href} variant="ghost" className="mt-5" trailingIcon={<ArrowUpRight className="size-4" aria-hidden />}>{copy.feedback.cta}</Button></div></Section>
    </>
  );
}
