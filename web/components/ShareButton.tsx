'use client';
// Share a bet: the phone's own share sheet where there is one, otherwise the link goes to the
// clipboard. The link opens a page whose preview image is the bet's card.
import { useState } from 'react';
import { Button } from './ui';

export function ShareButton({ positionId, text }: { positionId: bigint; text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/share/${positionId}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Renqun', text, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };
  return (
    <Button tone="soft" className="sm block" onClick={() => void share()}>
      {copied ? 'Link copied' : 'Share this win'}
    </Button>
  );
}
