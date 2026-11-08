import { Fragment } from 'react';
import { Check } from 'lucide-react';

// Coaching purchase steps. Kept separate from BookingStepBar (court booking) so either flow can
// change its steps without affecting the other; only the checkout-step* styles are shared.
const STEPS = [
  'Choose Package',
  'Terms & Conditions',
  'Payment & Checkout',
  'Book Session',
] as const;

interface CoachStepBarProps {
  currentStep: 1 | 2 | 3 | 4;
}

export default function CoachStepBar({ currentStep }: CoachStepBarProps) {
  return (
    <section className="checkout-steps" aria-hidden="true">
      {STEPS.map((label, idx) => {
        const stepNumber = (idx + 1) as 1 | 2 | 3 | 4;
        const isDone = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const dotClass = isDone ? 'done' : isCurrent ? 'current' : 'upcoming';

        return (
          <Fragment key={stepNumber}>
            <div className="checkout-step">
              <span className={`checkout-step-dot ${dotClass}`}>
                {isDone ? <Check size={17} strokeWidth={2.5} /> : stepNumber}
              </span>
              <small>{label}</small>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`checkout-step-line${currentStep > stepNumber ? ' active' : ''}`} />
            )}
          </Fragment>
        );
      })}
    </section>
  );
}
