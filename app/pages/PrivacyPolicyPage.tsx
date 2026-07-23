const privacyEmail = 'privacy@untitledmanagementsoftware.com';

function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 rounded-lg border border-[var(--border-light)] bg-white p-6 shadow-sm sm:p-8">
        <header className="border-b border-[var(--border-light)] pb-6">
          <p className="text-sm font-semibold text-primary">Untitled Management Software</p>
          <h1 className="mt-2 text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: July 23, 2026</p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            This Privacy Policy explains how Untitled Management Software ("UMS", "we", "us", or "our") collects,
            uses, shares, and protects information when you use our web and mobile apps.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Who This App Is For</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            UMS is intended for users who are at least 13 years old. The app is not directed to children under 13, and
            we do not knowingly collect personal information from children under 13. If you believe a child under 13 has
            provided information to us, contact us so we can review and delete it.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Information We Collect</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We collect information you provide or generate while using UMS, including your name, email address, account
            profile details, password authentication data handled through Firebase, and verified account email addresses.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            We store the schoolwork and productivity information you add to the app, such as courses, assignments, class
            sessions, events, notes, course links, due dates, descriptions, locations, and imported Brightspace calendar
            or PDF data.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            If you use Google sign-in, we receive Google account information needed to create or access your UMS account,
            such as your name, email address, and Google user identifier. If you connect Google Calendar, we request
            permission to read and write calendar event data needed to sync UMS events with your selected Google
            Calendar. We store connection details such as your Google email, calendar identifier, encrypted access or
            refresh tokens, sync status, sync history, and event metadata needed to keep calendars in sync.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            If you subscribe or start a paid plan, we store billing status and Stripe customer or subscription
            references. Payment card details are collected and processed by Stripe, not directly by UMS.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            If you enable notifications, we store notification preferences, time zone, reminder settings, scheduled
            reminder metadata, read or dismissed status, and device permission status where available. The app may also
            store limited data on your device, such as your auth session, OAuth state and return path, and local
            notification delivery state.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">How We Use Information</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We use your information to provide and maintain the app, authenticate accounts, save your schoolwork data,
            sync calendars when you choose to connect Google Calendar, send account and verification emails, process
            subscriptions, schedule reminders, prevent unauthorized access, troubleshoot issues, and respond to support
            or privacy requests.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            We do not sell personal information. We do not use your information for third-party advertising, ad
            tracking, or targeted advertising. We do not use Google user data for advertising, and we do not transfer
            Google user data except as needed to provide the app, comply with law, protect security, or with your
            direction.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">How We Share Information</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We share information with service providers that help operate UMS, including Firebase and Google services
            for authentication and optional Calendar sync, Stripe for billing, SendGrid for email delivery, and hosting,
            database, security, and infrastructure providers. These providers process information for us so the app can
            function.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            We may also disclose information if required by law, to protect users or the app, to investigate abuse or
            security issues, or as part of a merger, acquisition, financing, or sale of assets, subject to appropriate
            protections.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Your Choices</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            You can update account profile details, manage connected email addresses, disconnect Google Calendar,
            change notification preferences, cancel or manage your subscription, and delete your account from the app.
            You can also revoke Google access from your Google Account settings and manage device notification
            permissions from your browser or operating system.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            When you delete your account in UMS, the app deletes account-linked app data such as courses, assignments,
            notes, events, connected email records, Google Calendar connection records, notification records, staging
            access records, and subscription records. The app also attempts to cancel and delete the related Stripe
            customer or subscription records and remove the Firebase authentication user.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Retention And Security</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We keep information for as long as needed to provide the app, maintain records, resolve disputes, enforce
            agreements, or meet legal and security obligations. We use reasonable technical and organizational measures
            designed to protect information, including authenticated API access, encrypted storage for Google Calendar
            tokens, and service providers with their own security controls. No method of transmission or storage is
            completely secure.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Changes To This Policy</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We may update this Privacy Policy as the app or our practices change. If we make material changes, we will
            update the date above and provide notice as appropriate.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            For privacy questions or data requests, contact us at{' '}
            <a className="font-semibold text-primary hover:underline" href={`mailto:${privacyEmail}`}>
              {privacyEmail}
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}

export default PrivacyPolicyPage;
