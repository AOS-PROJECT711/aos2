import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "AOS password reset" },
      { name: "description", content: "Choose a new password for your AOS account using your secure email link." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "AOS password reset" },
      { property: "og:description", content: "Set a new password for your AOS account." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [validLink, setValidLink] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    const isRecoveryLink = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") === "recovery";
    if (!isRecoveryLink) {
      setValidLink(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (active && session?.user) setValidLink(true);
      }
    });
    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (active) setValidLink(!userError && Boolean(data.user));
    }).catch(() => {
      if (active) setValidLink(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setComplete(true);
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-background bg-grid px-4 py-12 sm:items-center">
      <section className="w-full max-w-md border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AOS account</p>
        <h1 className="mt-2 text-2xl font-bold">Choose a new password</h1>
        {complete ? (
          <div className="mt-5 space-y-4">
            <p role="status" className="text-sm text-primary">Your password has been changed.</p>
            <Button asChild><Link to="/auth">Continue to sign in</Link></Button>
          </div>
        ) : validLink === null ? (
          <p className="mt-5 text-sm text-muted-foreground">Checking your email link…</p>
        ) : !validLink ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-destructive">This reset link is invalid or has expired. Request a new one.</p>
            <Button asChild variant="outline"><Link to="/auth">Return to sign in</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label htmlFor="new-password" className="block text-sm font-medium">New password</label>
            <Input id="new-password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
            <label htmlFor="confirm-password" className="block text-sm font-medium">Confirm new password</label>
            <Input id="confirm-password" type="password" autoComplete="new-password" required minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Updating…" : "Update password"}</Button>
          </form>
        )}
        <Link to="/" search={{ code: undefined, room: undefined }} className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground">Back to sharing</Link>
      </section>
    </main>
  );
}