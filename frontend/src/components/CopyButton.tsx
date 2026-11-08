import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { announce, copyText } from '@/lib/utils';

type CopyState = 'idle' | 'copied' | 'failed';

// Copy icon button with visible feedback: shows ✓ and "Copied" (or "Copy failed") for 2 seconds.
// `className` keeps each screen's existing button look.
export default function CopyButton({
  text,
  label,
  className,
  iconSize = 16,
}: {
  text: string;
  label: string;          // e.g. "Copy booking id"; also the screen-reader name
  className?: string;
  iconSize?: number;
}) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    const copied = await copyText(text);
    setState(copied ? 'copied' : 'failed');
    announce(copied ? 'Copied to clipboard.' : 'Could not copy. Please select and copy the text manually.');
  }

  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Copy;

  return (
    <button
      type="button"
      className={`copy-btn${className ? ` ${className}` : ''}${state !== 'idle' ? ` is-${state}` : ''}`}
      onClick={handleCopy}
      aria-label={label}
      title={label}
    >
      <Icon size={iconSize} strokeWidth={2.3} aria-hidden="true" />
      {state !== 'idle' && (
        <span className="copy-btn-toast" aria-hidden="true">{state === 'copied' ? 'Copied' : 'Copy failed'}</span>
      )}
    </button>
  );
}
