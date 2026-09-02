import { ShieldAlert, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  busyLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busyLabel = 'Processing...',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <header>
          <span className={destructive ? 'destructive' : ''}><ShieldAlert size={21} /></span>
          <div><small>Confirmation required</small><h2 id="confirm-dialog-title">{title}</h2></div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close confirmation"><X size={18} /></button>
        </header>
        <p id="confirm-dialog-message">{message}</p>
        <footer>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={destructive ? 'destructive' : ''} onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</button>
        </footer>
      </section>
    </div>
  );
}