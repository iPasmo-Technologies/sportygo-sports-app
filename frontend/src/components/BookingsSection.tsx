import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

// A My Bookings section (court bookings, or one sport's coaching) with a collapse / expand button
// on the right of its heading. Sections start open.
export default function BookingsSection({
  title,
  icon,
  count,
  className,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section className={`bookings-section-v2${className ? ` ${className}` : ''}${open ? '' : ' is-collapsed'}`}>
      <header>
        <h2>
          {icon}
          {title}
        </h2>
        {count !== undefined && <span>{count}</span>}
        <button
          type="button"
          className="bookings-section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          title={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </header>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
