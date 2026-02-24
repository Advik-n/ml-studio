export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[var(--bg)] via-[var(--surface)] to-[var(--bg)]">
      <div className="w-full max-w-md">
        {children}
      </div>
    </main>
  );
}
