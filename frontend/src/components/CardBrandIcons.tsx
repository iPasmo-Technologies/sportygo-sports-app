export type SupportedCardBrand = 'visa' | 'mastercard' | 'amex' | 'unionpay' | 'unknown';

function CardBrandIcon({ brand, active }: { brand: SupportedCardBrand; active: boolean }) {
  const className = `checkout-card-brand-icon${active ? ' active' : ''}`;

  switch (brand) {
    case 'visa':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <g clipPath="url(#visa-card-brand)">
            <path fill="#00579f" d="M22 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2" />
            <path fill="#fff" d="M10.367 10.91H8.85l.949-5.802h1.517zm5.501-5.66a3.8 3.8 0 0 0-1.36-.247c-1.5 0-2.555.79-2.561 1.92-.013.833.755 1.296 1.33 1.574.587.284.786.469.786.722-.006.389-.474.568-.91.568-.607 0-.931-.092-1.425-.309l-.2-.092-.212 1.302c.356.16 1.012.303 1.692.309 1.593 0 2.63-.778 2.642-1.982.006-.66-.4-1.166-1.274-1.58-.53-.265-.856-.444-.856-.716.006-.247.275-.5.874-.5.493-.012.856.105 1.13.222l.138.062z" />
            <path fill="#fff" fillRule="evenodd" d="M18.584 5.108h1.174l1.224 5.802h-1.405l-.18-.87h-1.95c-.055.154-.318.87-.318.87h-1.592l2.254-5.32c.156-.377.431-.482.793-.482m-.093 2.124-.606 1.623h1.261c-.062-.29-.35-1.679-.35-1.679l-.106-.5a31 31 0 0 1-.2.556" clipRule="evenodd" />
            <path fill="#fff" d="M7.582 5.108 6.096 9.065l-.162-.803c-.275-.926-1.136-1.931-2.098-2.432l1.361 5.074h1.605l2.385-5.796z" />
            <path fill="#fff" d="M4.716 5.108H2.275l-.025.118c1.904.481 3.166 1.641 3.684 3.036l-.53-2.666c-.088-.37-.357-.475-.688-.488" />
          </g>
          <defs>
            <clipPath id="visa-card-brand">
              <path fill="#fff" d="M0 0h24v16H0z" />
            </clipPath>
          </defs>
        </svg>
      );
    case 'mastercard':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <rect fill="#252525" width="24" height="16" rx="2" />
          <circle cx="9" cy="8" r="5" fill="#eb001b" />
          <circle cx="15" cy="8" r="5" fill="#f79e1b" />
          <path fill="#ff5f00" d="M12 4c1.214.912 2 2.364 2 4s-.786 3.088-2 4c-1.214-.912-2-2.364-2-4s.786-3.088 2-4z" />
        </svg>
      );
    case 'amex':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <g clipPath="url(#amex-card-brand)">
            <path fill="#0193ce" d="M22 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2" />
            <path fill="#fff" d="m19.127 8.063 2.278-2.333h-3.037l-.823.883-.696-.883h-3.505v.63h3.252l.949 1.135L18.62 6.36h1.139l-1.646 1.703 1.646 1.575h-1.14l-1.075-1.133-.986 1.133h-3.215v.632h3.505l.696-.883.823.883h3.037z" />
            <path fill="#fff" d="M14.19 9.009h1.9l.885-.946-.76-.946h-2.024v.63h1.772v.631H14.19z" />
            <path fill="#fff" fillRule="evenodd" d="m5.478 9.514-.262.756H2.595l2.228-4.54h2.102l.258.504V5.73h2.621l.525 1.261.524-1.261h2.49v4.54h-1.972v-.63l-.256.63H9.542l-.262-.63v.63H6.396l-.262-.756zm6.424.126h.782l.004-3.28h-1.31l-1.05 2.27L9.28 6.36H7.97v3.027L6.395 6.36H5.347L3.774 9.64h.918l.262-.757h1.704l.262.757h1.836V7.117l1.18 2.523h.786l1.18-2.523zM6.396 8.252l-.524-1.387-.656 1.387z" clipRule="evenodd" />
          </g>
          <defs>
            <clipPath id="amex-card-brand">
              <path fill="#fff" d="M0 0h24v16H0z" />
            </clipPath>
          </defs>
        </svg>
      );
    case 'unionpay':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <path fill="#dd2423" d="M4.546 0h5.794c.808 0 1.311.726 1.123 1.619L8.765 14.368c-.19.89-1 1.616-1.81 1.616H1.164c-.808 0-1.312-.726-1.123-1.616L2.738 1.619C2.927.726 3.736 0 4.546 0" />
          <path fill="#16315e" d="M9.858 0h6.662c.809 0 .444.726.254 1.619l-2.697 12.749c-.19.89-.13 1.616-.94 1.616H6.474c-.81 0-1.312-.726-1.122-1.616L8.05 1.619C8.241.726 9.05 0 9.858 0" />
          <path fill="#036862" d="M16.256 0h5.794c.81 0 1.313.726 1.122 1.619l-2.697 12.749c-.19.89-1 1.616-1.81 1.616h-5.791c-.81 0-1.313-.726-1.123-1.616l2.697-12.749C14.637.726 15.446 0 16.256 0" />
          <path fill="#fff" d="M4.244 4.145h1.03l-.522 2.443c-.075.335-.25 1.114-1.425 1.114-.714 0-1.11-.279-1.11-.885 0-.123.014-.262.044-.412l.505-2.26h1.03l-.49 2.222a1.5 1.5 0 0 0-.029.24c0 .201.113.3.362.3.335 0 .507-.195.61-.67zm2.465 1.255c.154 0 .304.03.4.078l-.143.693a.74.74 0 0 0-.355-.083c-.26 0-.45.109-.559.642l-.186.915h-.963l.366-1.772c.06-.286.1-.548.126-.776h.835l-.05.34h.012c.166-.266.383-.414.517-.414zm2.538.871c0 .862-.505 1.43-1.35 1.43-.676 0-1.094-.41-1.094-1.023 0-.822.486-1.428 1.349-1.428.707 0 1.095.437 1.095 1.021zm-1.463.386c0 .22.086.349.258.349.291 0 .446-.472.446-.763 0-.211-.079-.35-.25-.35-.299 0-.454.464-.454.764zm3.07-1.257c.571 0 .79.353.79.77 0 .164-.028.36-.075.58l-.19.896h-.954l.164-.774c.03-.149.066-.314.066-.41 0-.117-.046-.188-.169-.188-.105 0-.214.053-.324.132l-.259 1.24h-.954l.355-1.697c.052-.257.088-.503.122-.729h.86l-.044.282h.01c.24-.213.438-.302.602-.302z" />
        </svg>
      );
    default:
      return null;
  }
}

export function CardBrandIcons({ activeBrand }: { activeBrand: SupportedCardBrand }) {
  const brands: SupportedCardBrand[] = ['visa', 'mastercard', 'amex', 'unionpay'];

  return (
    <div className="checkout-card-brand-list" aria-hidden="true">
      {brands.map((brand) => (
        <CardBrandIcon key={brand} brand={brand} active={activeBrand === 'unknown' || activeBrand === brand} />
      ))}
    </div>
  );
}
