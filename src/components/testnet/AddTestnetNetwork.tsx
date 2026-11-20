"use client";

import { useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TESTNET } from "@/lib/content/site";
import { requestTestnetNetwork } from "@/lib/testnet-wallet";

type Provider = { isMetaMask?: boolean; providers?: Provider[]; request: (args: { method: string; params: unknown[] }) => Promise<unknown> };

export function AddTestnetNetwork() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  async function add() {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setMessage("");
    try {
      const injected = (window as unknown as { ethereum?: Provider }).ethereum;
      const provider = injected?.providers?.find(p => p.isMetaMask) ?? injected;
      await requestTestnetNetwork(provider, TESTNET.network);
      setMessage(TESTNET.setup.sent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Use the manual network details below.");
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={add} disabled={pending} leadingIcon={<Wallet className="size-4" aria-hidden />}>
        {pending ? TESTNET.setup.pending : TESTNET.setup.add}
      </Button>
      <p role="status" aria-live="polite" className="max-w-[52ch] text-sm leading-relaxed text-on-surface-variant">{message}</p>
    </div>
  );
}
