import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';

/** Layout for the public, no-sign-in pages (/privacy, /contact). */
export default function PublicPageShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-line-soft">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="h-9 w-9 -ml-2 rounded-full flex items-center justify-center text-ink hover:bg-chip"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-512.png" alt="" className="h-6 w-6 rounded-md" />
            <span className="text-sm font-semibold text-ink">ExpenseSync</span>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display font-semibold text-[28px] text-ink" style={{ letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
