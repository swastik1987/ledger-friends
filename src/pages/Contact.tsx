import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, CircleNotch, PaperPlaneTilt } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PublicPageShell from '@/components/PublicPageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Public contact form. Messages land in the contact_messages table
// (migration 20261003120000): anyone can insert, nobody can read them
// through the API; the owner reads them in the Supabase / Lovable table
// editor. Doubles as Google Play's "request account deletion" web link:
// /contact?topic=account_deletion.

const TOPICS = [
  { value: 'general', label: 'General question' },
  { value: 'bug', label: 'Report a problem' },
  { value: 'privacy', label: 'Privacy or my data' },
  { value: 'account_deletion', label: 'Delete my account' },
] as const;
type Topic = (typeof TOPICS)[number]['value'];

const isTopic = (v: string | null): v is Topic => TOPICS.some(t => t.value === v);

export default function ContactPage() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  const initialTopic = params.get('topic');

  const [topic, setTopic] = useState<Topic>(isTopic(initialTopic) ? initialTopic : 'general');
  const [name, setName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [message, setMessage] = useState('');
  // Honeypot: a field people never see. Bots that fill every input get a fake success.
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Prefill for signed-in users once auth has loaded, without overwriting typing.
  useEffect(() => {
    if (user?.email) setEmail(prev => prev || user.email || '');
    if (profile?.full_name) setName(prev => prev || profile.full_name);
  }, [user, profile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Please enter a valid email address so we can reply.');
      return;
    }
    if (!trimmedMessage) {
      toast.error('Please write a message.');
      return;
    }
    if (website) {
      setSentTo(trimmedEmail);
      return;
    }
    setSending(true);
    const { error } = await supabase.from('contact_messages').insert({
      topic,
      name: name.trim() || null,
      email: trimmedEmail,
      message: trimmedMessage.slice(0, 4000),
    });
    setSending(false);
    if (error) {
      toast.error("Couldn't send your message. Please try again in a moment.");
      return;
    }
    setSentTo(trimmedEmail);
  };

  if (sentTo) {
    return (
      <PublicPageShell title="Contact us">
        <div className="mt-8 rounded-2xl bg-card border border-line-soft p-6 text-center">
          <CheckCircle size={40} className="mx-auto text-earn" />
          <p className="mt-3 font-semibold text-ink">Thanks — your message is on its way.</p>
          <p className="mt-1 text-sm text-ink-soft">We'll reply to {sentTo}.</p>
        </div>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell title="Contact us">
      <p className="mt-2 text-[15px] text-ink-soft">
        Questions, problems, privacy requests or account deletion — send us a message and we'll reply by email.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="contact-topic">Topic</Label>
          <select
            id="contact-topic"
            value={topic}
            onChange={e => setTopic(e.target.value as Topic)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TOPICS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {topic === 'account_deletion' && (
            <p className="text-xs text-ink-faint">
              You can also delete your account yourself under You → Delete My Account. Send this from the email
              address of the account you want deleted.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-name">Name <span className="text-ink-faint">(optional)</span></Label>
          <Input id="contact-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={320}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-message">Message</Label>
          <Textarea
            id="contact-message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={4000}
            rows={6}
            required
          />
          <p className="text-[11px] text-ink-faint text-right">{message.length}/4000</p>
        </div>

        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input id="contact-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </div>

        <Button type="submit" disabled={sending} className="w-full h-11 gap-2">
          {sending ? <CircleNotch className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
          Send message
        </Button>
        <p className="text-[11px] text-ink-faint text-center">
          We use your email only to reply. See our <a href="/privacy" className="underline">privacy policy</a>.
        </p>
      </form>
    </PublicPageShell>
  );
}
