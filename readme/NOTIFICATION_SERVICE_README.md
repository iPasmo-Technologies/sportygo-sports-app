# SportyGo Notification Service Options

## Purpose

SportyGo can notify customers when they create an account, request a password reset, or complete a booking. Notifications can include:

- A branded account welcome message with SportyGo benefits and community links
- A password-reset passcode
- Payment status
- Booking confirmation number
- Facility name and address
- Booking date and time
- Booking duration
- Total amount paid

The notification can be sent by email, WhatsApp, SMS, or a combination of these services.

## Important Difference

Render is the hosting platform for the SportyGo backend. Render does not provide a complete email, WhatsApp, or SMS service by itself.

Render can store the service settings securely as environment variables. The actual messages are sent through an external email, WhatsApp, or SMS provider.

## Option 1: Email

### Recommended starting option

Email is the simplest and lowest-cost option for SportyGo. The current backend already supports email sending through SMTP.

Customers can receive a welcome email after successful registration, a password-reset passcode, and a booking confirmation containing the same type of information shown in the My Bookings card.

### Email providers

| Provider | Expected cost | Good for | Notes |
|---|---:|---|---|
| Existing company SMTP | Depends on current email provider | If the client already owns a business mailbox | Lowest setup effort if SMTP access is available |
| Brevo SMTP | Free tier may be available; paid plans after limits | Small and medium booking volumes | Easy for transactional email |
| Amazon SES | Very low pay-as-you-go cost | Higher volume | More technical setup, but usually inexpensive |
| SendGrid | Free availability varies; paid plans available | Managed business email | Sender/domain verification required |
| Gmail SMTP | Free for testing or very low volume | Development only | Requires App Password; not recommended as the long-term production sender |
| Cloudflare Email Service | Depends on Cloudflare account/product availability | Applications already using Cloudflare | Requires domain onboarding and email authentication; it is not a normal SMTP mailbox |

### Render configuration

Add these environment variables to the Render backend service:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-smtp-user
SMTP_PASS=your-brevo-smtp-key
SMTP_FROM=SportyGo <verified-sender@yourdomain.com>
```

These values must be added in the Render dashboard, not committed to Git.

### Email requirements

The client should have:

- A verified sender email address or domain
- SPF configuration
- DKIM configuration
- DMARC configuration recommended
- SMTP username and password or SMTP API credentials

Without SMTP settings, account creation and booking remain successful, but welcome and booking emails cannot be delivered. Password-reset requests require working SMTP delivery so the customer can receive the passcode.

## Option 2: WhatsApp

### Is WhatsApp free?

WhatsApp is free for customers to use, but automated business messages are not normally free in production.

The official WhatsApp options require a WhatsApp Business setup and may charge based on message or conversation category.

### WhatsApp providers

| Provider | Expected cost | Good for | Notes |
|---|---:|---|---|
| Meta WhatsApp Cloud API | Usually the lowest direct WhatsApp cost | Businesses that can manage their own setup | Requires Meta Business verification and approved templates |
| Twilio WhatsApp | Provider fee plus WhatsApp charges | Easier managed integration | Usually more expensive than using Meta directly |
| Vonage WhatsApp | Provider-dependent | Larger business integrations | Requires business and sender setup |
| 360dialog | Provider or monthly fee plus WhatsApp charges | WhatsApp-focused businesses | Useful when WhatsApp is the main channel |
| WhatsApp test number | Usually free for development | Testing only | Not a production notification solution |

### WhatsApp requirements

The client will need:

- A WhatsApp Business account
- A verified business or approved business setup
- A business phone number
- Customer consent to receive messages
- An approved booking-confirmation message template
- Meta or provider API credentials

Cloudflare can host a webhook or Worker that connects to WhatsApp, but Cloudflare does not replace Meta or a WhatsApp provider.

## Option 3: SMS

### Is SMS free?

Production SMS is normally charged per message. Free trial credits may be available, but they should not be treated as a permanent free service.

### SMS providers

| Provider | Expected cost | Good for | Notes |
|---|---:|---|---|
| AWS SNS | Low pay-as-you-go cost | Simple SMS notifications | Good option for a technical team already using AWS |
| Twilio SMS | Pay-as-you-go | Easy integration | Pricing varies by country and sender type |
| Vonage SMS | Pay-as-you-go | International delivery | Country-specific pricing applies |
| Bird/MessageBird | Provider-dependent | Broader business messaging | Usually more features than needed initially |
| Singapore SMS provider | Provider-dependent | Singapore-only customers | Worth comparing for local volume and sender rules |

### SMS requirements

The client will need:

- Customer mobile numbers
- Customer consent
- An SMS provider account
- Sender ID or approved sender configuration
- Delivery and retry handling
- Country-specific compliance checks

## Example Monthly Cost

The following is an illustration only. Actual pricing depends on provider, destination country, taxes, message length, and monthly volume.

Assume 500 bookings per month and one notification per booking:

| Channel | Typical monthly expectation | Comments |
|---|---:|---|
| Email | Free to a few Singapore dollars | Many providers have free or low-cost starter plans |
| WhatsApp | Low cost to variable cost | Depends on Meta conversation category and provider fees |
| SMS | A few Singapore dollars or more | Depends heavily on destination and local SMS rates |
| All three channels | Usually low single-digit to tens of Singapore dollars | WhatsApp and SMS are the main variable costs |

## Recommended Approach

### Phase 1: Email first

Use email as the initial notification channel.

Reasons:

- Already supported by the backend
- Lowest implementation complexity
- Low cost
- Easy to keep a permanent booking record
- No WhatsApp template approval required
- No SMS sender setup required

Recommended choices:

1. Use the client's existing business SMTP if available.
2. Otherwise compare Brevo SMTP and Amazon SES.
3. Use a verified SportyGo business email address.

### Phase 2: WhatsApp second

Add WhatsApp after the email flow is stable.

Recommended choice:

- Meta WhatsApp Cloud API for the lowest direct provider cost
- Twilio WhatsApp if the client prefers easier managed setup

This phase requires customer opt-in and an approved booking-confirmation template.

### Phase 3: SMS fallback

Add SMS only when needed, for example:

- The customer did not provide WhatsApp consent
- WhatsApp delivery failed
- The customer requests SMS
- A critical reminder must be delivered

AWS SNS or a Singapore-focused SMS provider can be evaluated at this stage.

## Suggested Technical Design

The system should treat each notification channel independently:

```text
Booking is saved successfully
        |
        +--> Send confirmation email
        |
        +--> Send WhatsApp message if enabled and customer opted in
        |
        +--> Send SMS fallback if enabled and required
```

A failure in one channel should not cancel the booking. For example, an email failure should not undo a successful payment or booking.

The notification system should also support:

- Retry attempts
- Delivery status logging
- Provider error logging without exposing secrets
- Message templates
- Customer opt-in records
- Notification history for support staff

## Information Needed From the Client

Before enabling notifications, please decide:

1. Which email sender should customers see?
2. Does the client already have a business email mailbox with SMTP access?
3. Should WhatsApp be required, optional, or skipped initially?
4. Should SMS be used only as a fallback?
5. What monthly booking volume is expected?
6. Which countries will receive messages?
7. Has the client agreed to collect notification consent from customers?
8. Which provider account will be owned and paid for by the client?

## Recommendation Summary

| Decision | Recommendation |
|---|---|
| First channel | Email |
| Email provider | Existing business SMTP, Brevo, or Amazon SES |
| Cloudflare role | Host the application, Workers, webhooks, and optionally email integration |
| WhatsApp provider | Meta Cloud API for lowest direct cost; Twilio for easier managed setup |
| SMS provider | AWS SNS or a Singapore-focused SMS provider |
| Free production option | Email may be free or very low cost; WhatsApp and SMS are generally not permanently free |
| Best rollout | Email first, WhatsApp second, SMS as an optional fallback |
