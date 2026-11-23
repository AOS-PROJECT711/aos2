import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";

import logo from "@/assets/aos-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAccountSession } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "AOS account sign in and sign up" },
      { name: "description", content: "Sign in or create an optional AOS account to keep your file-share history." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "AOS account sign in and sign up" },
      { property: "og:description", content: "Use an optional AOS account to manage your sent and received file-share history." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type AuthMode = "signin" | "signup" | "forgot";

function AuthPage() {
  const session = useAccountSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage("If an account uses that email, a password-reset link is on its way.");
        return;
      }

      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signupError) throw signupError;
        if (data.session) {
          await navigate({ to: "/history", replace: true });
        } else {
          setMessage("Check your email and confirm your account before signing in.");
        }
        return;
      }

      const { error: signinError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signinError) throw signinError;
      await navigate({ to: "/history", replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete that request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";

  return (
    <main className="min-h-screen bg-background bg-grid px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link to="/" search={{ code: undefined, room: undefined }} className="flex items-center gap-3 text-foreground">
          <img src={logo} alt="AOS logo" className="h-10 w-10 rounded-full" />
          <span className="font-bold">AOS</span>
        </Link>
        <Button asChild type="button" variant="ghost" size="sm">
          <Link to="/" search={{ code: undefined, room: undefined }}><ArrowLeft /> Back to sharing</Link>
        </Button>
      </div>

      <section className="mx-auto mt-12 w-full max-w-md border bg-card p-6 sm:mt-16 sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AOS account</p>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "We’ll email you a secure link to choose a new password."
              : "Sign in to keep your file-share history. Sharing by code still works without an account."}
          </p>
        </div>

        {mode !== "forgot" && (
          <div className="mb-5 grid grid-cols-2 gap-2 border-b pb-3">
            <Button type="button" variant={mode === "signin" ? "default" : "ghost"} onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>
              Sign in
            </Button>
            <Button type="button" variant={mode === "signup" ? "default" : "ghost"} onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>
              Sign up
            </Button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium" htmlFor="account-email">Email</label>
          <div className="relative -mt-2">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="pl-10" />
          </div>

          {mode !== "forgot" && (
            <>
              <label className="block text-sm font-medium" htmlFor="account-password">Password</label>
              <div className="relative -mt-2">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="account-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" />
              </div>
            </>
          )}

          <Button type="submit" disabled={busy || !session.ready} className="w-full">
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Email reset link" : "Sign in"}
          </Button>
        </form>

        {mode === "signin" && (
          <Button type="button" variant="link" className="mt-3 h-auto px-0" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>
            Forgot password?
          </Button>
        )}
        {mode === "forgot" && (
          <Button type="button" variant="link" className="mt-3 h-auto px-0" onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>
            Back to sign in
          </Button>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 text-sm text-primary">{message}</p>}
      </section>
    </main>
  );
}