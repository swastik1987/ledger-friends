import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from '@/components/PublicPageShell';

// The public privacy policy (Google Play needs it at a URL). Keep it true to
// what the app does: update it, and EFFECTIVE_DATE, whenever data handling
// changes (e.g. moving Gemini to a paid tier, adding analytics).
const EFFECTIVE_DATE = '3 October 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-display font-semibold text-[18px] text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

const contactLink = <Link to="/contact" className="text-ember underline underline-offset-2">contact form</Link>;

export default function PrivacyPage() {
  return (
    <PublicPageShell title="Privacy policy">
      <p className="mt-2 text-sm text-ink-faint">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
        ExpenseSync helps you track expenses, on your own or shared with people you invite. This policy explains
        what data the app handles, why, and the choices you have. It covers the website and the Android app.
      </p>

      <Section title="What we collect">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-ink">Account information:</strong> your name and email address, and your Google
            account's basic profile if you sign in with Google. We use it to create and secure your account, and to
            show who added a transaction in shared trackers.
          </li>
          <li>
            <strong className="text-ink">Expense data you enter or import:</strong> transactions (amounts, dates,
            descriptions, merchants, categories, banks, payment methods, notes), the trackers you create or join,
            and their members.
          </li>
          <li>
            <strong className="text-ink">Bank statements you upload:</strong> the file is read on your device and is
            never uploaded or stored. Only the text extracted from it is sent to our server, so the transactions can
            be recognised and categorised. The transactions are saved to your tracker only after you review and
            approve them.
          </li>
          <li>
            <strong className="text-ink">Messages you send us</strong> through the {contactLink}: your email
            address, optional name, and your message.
          </li>
        </ul>
        <p>We don't collect location, contacts, photos, advertising identifiers or usage analytics.</p>
      </Section>

      <Section title="How we use it">
        <p>
          Only to provide the app: storing and syncing your trackers, showing totals and charts, letting members of
          a shared tracker see its transactions, suggesting categories, and answering your messages.
        </p>
      </Section>

      <Section title="Who processes it">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-ink">Supabase</strong> hosts our database and sign-in. Data is encrypted in
            transit (HTTPS).
          </li>
          <li>
            <strong className="text-ink">Google Gemini</strong>, Google's AI service, receives the text extracted
            from statements you upload, to turn it into transactions. We currently use Gemini's free tier, under
            which Google may use the submitted text to improve its products. If you'd rather not send statement
            text to Google, you can add transactions by hand instead.
          </li>
          <li>
            <strong className="text-ink">Google Sign-In</strong> handles sign-in if you choose "Continue with
            Google".
          </li>
        </ul>
        <p>We don't sell your data or use it for advertising.</p>
      </Section>

      <Section title="Sharing inside the app">
        <p>
          When you create or join a shared tracker, its members can see that tracker's transactions and the names
          of the people who added them. Trackers you don't share are visible only to you.
        </p>
      </Section>

      <Section title="On your device">
        <p>
          The Android app keeps a copy of your trackers and transactions on your phone, so they're available
          offline, and syncs your changes when you're back online. This copy is excluded from device backups and
          transfers, and is erased when you sign out.
        </p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>
          We keep your data while your account exists. You can delete transactions and trackers at any time.
        </p>
        <p>
          To delete your account, use <strong className="text-ink">You → Delete My Account</strong> in the app or
          on the website. You can also ask us through the {contactLink} (topic "Delete my account"). Deleting your
          account removes your profile and the trackers you own, with their transactions, and removes you from
          trackers others share with you. Deleted data may remain in our hosting provider's backups for a limited
          time before it's purged.
        </p>
      </Section>

      <Section title="Children">
        <p>ExpenseSync isn't intended for anyone under 18, and we don't knowingly collect data from children.</p>
      </Section>

      <Section title="Changes">
        <p>We'll update this page when the way we handle data changes, and change the effective date above.</p>
      </Section>

      <Section title="Contact">
        <p>Questions or requests about your data: use our {contactLink}.</p>
      </Section>
    </PublicPageShell>
  );
}
