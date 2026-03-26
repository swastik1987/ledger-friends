import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FileUp, PenLine, Users, BarChart3, ArrowRight,
  Shield, CloudOff, Sparkles, ChevronRight,
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Top Nav ─── */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo-512.png" alt="ExpenseSync" className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-base">ExpenseSync</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={scrollToFeatures} className="hover:text-foreground transition-colors">Features</button>
            <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-foreground transition-colors">How It Works</button>
          </div>
          <Button size="sm" onClick={() => navigate('/auth')} className="h-9 px-4 gap-1.5">
            Login <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <div className="absolute top-20 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-32 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered expense tracking
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight">
            Track Every Rupee.
            <br />
            <span className="text-primary">Together.</span>
          </h1>

          <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Upload bank statements and let AI sort your expenses, or add them manually.
            Share trackers with family and friends — everyone stays in sync.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate('/auth')} className="h-12 px-8 text-base gap-2 shadow-lg shadow-primary/20">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToFeatures} className="h-12 px-8 text-base">
              See How It Works
            </Button>
          </div>

          {/* Mini social proof */}
          <p className="mt-6 text-xs text-muted-foreground">
            No credit card required. Free forever for personal use.
          </p>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-16 sm:py-24 bg-card/50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">Everything you need to stay on top of your money</h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
              Whether it's your personal expenses or a shared household budget, ExpenseSync has you covered.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Feature 1: Statement Upload */}
            <div className="group rounded-2xl border border-border bg-card p-6 sm:p-8 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <FileUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Smart Statement Upload</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Drop your bank statement PDF, CSV, or Excel file. Our AI reads every transaction, categorizes it,
                and learns your preferences over time. No manual data entry needed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">PDF</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">CSV</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Excel</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">AI Categorized</span>
              </div>
            </div>

            {/* Feature 2: Manual Tracking */}
            <div className="group rounded-2xl border border-border bg-card p-6 sm:p-8 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <PenLine className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Quick Manual Tracking</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Add expenses on the go with just a few taps. Pick a category, add notes, tag it —
                your transaction is saved in seconds. Supports multiple currencies with auto-conversion.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Quick Add</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Multi-currency</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Tags & Notes</span>
              </div>
            </div>

            {/* Feature 3: Family & Group */}
            <div className="group rounded-2xl border border-border bg-card p-6 sm:p-8 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Users className="h-6 w-6 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Family & Group Tracking</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create shared trackers and invite family members, roommates, or travel buddies.
                Everyone adds their own expenses, and you all see the same real-time dashboard.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Shared Trackers</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Real-time Sync</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Role Management</span>
              </div>
            </div>

            {/* Feature 4: Insights & Export */}
            <div className="group rounded-2xl border border-border bg-card p-6 sm:p-8 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="h-12 w-12 rounded-xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <BarChart3 className="h-6 w-6 text-violet-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Insights & Export</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Visual dashboards with spending vs income charts, category breakdowns, and trends.
                Export everything to Excel with one tap for your records or tax filing.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Charts</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Category Breakdown</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Excel Export</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">Up and running in 3 steps</h2>
            <p className="mt-3 text-muted-foreground">No complicated setup. Start tracking in under a minute.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {/* Step 1 */}
            <div className="relative text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0">1</span>
                <ChevronRight className="hidden sm:block h-5 w-5 text-muted-foreground/40 absolute right-0 top-3" />
              </div>
              <h3 className="font-semibold text-base mb-2">Create a Tracker</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Name it anything — "Home Expenses", "Goa Trip", "Roommate Bills".
                Pick your currency and invite members if it's shared.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0">2</span>
                <ChevronRight className="hidden sm:block h-5 w-5 text-muted-foreground/40 absolute right-0 top-3" />
              </div>
              <h3 className="font-semibold text-base mb-2">Add Transactions</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Type them in manually, or upload a bank statement. AI extracts
                and categorizes everything — you just review and save.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0">3</span>
              </div>
              <h3 className="font-semibold text-base mb-2">See the Big Picture</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Charts, breakdowns, and filters show exactly where your money goes.
                Export to Excel anytime for records or tax filing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust Strip ─── */}
      <section className="py-12 sm:py-16 bg-card/50 border-y border-border">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-semibold text-sm">Bank-Grade Security</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Your data is encrypted and protected by Supabase's enterprise-grade infrastructure. Row-level security on every table.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CloudOff className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Files Never Stored</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Uploaded statements are processed in memory and immediately discarded. Your raw files never touch our servers.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="font-semibold text-sm">Free Forever</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  No hidden fees, no premium tier, no credit card required. ExpenseSync is completely free for personal use.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to take control of your expenses?</h2>
          <p className="mt-3 text-muted-foreground max-w-md mx-auto">
            Join thousands of users who've simplified their expense tracking. It takes less than a minute to get started.
          </p>
          <Button size="lg" onClick={() => navigate('/auth')} className="mt-8 h-12 px-8 text-base gap-2 shadow-lg shadow-primary/20">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-512.png" alt="ExpenseSync" className="h-6 w-6 rounded-md" />
            <span className="text-sm font-semibold">ExpenseSync</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built with care for people who want clarity over their finances.
          </p>
        </div>
      </footer>
    </div>
  );
}
