import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Inhouse Rematch" },
      { name: "description", content: "Entre na arena: crie sua conta ou faça login para entrar na fila." },
      { property: "og:title", content: "Entrar · Inhouse Rematch" },
      { property: "og:description", content: "Entre na arena: crie sua conta ou faça login para entrar na fila." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [nick, setNick] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") navigate({ to: "/reset-password", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendReset() {
    setError("");
    if (!email.trim()) {
      setError("Digite seu e-mail para recuperar a senha.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o e-mail.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Old recovery emails still point here: send them to the new-password page
    // instead of auto-entering the site without changing the password.
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("error_code=")) {
      navigate({ to: "/reset-password", hash: hash.replace(/^#/, ""), replace: true });
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && !window.location.hash.includes("type=recovery")) navigate({ to: "/inicio", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: nick.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (err) throw err;
        if (!data.session) {
          setConfirm(true);
          return;
        }
        navigate({ to: "/inicio" });
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: "/inicio" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Algo deu errado.";
      setError(
        msg.includes("Invalid login credentials")
          ? "E-mail ou senha incorretos."
          : msg.includes("already registered")
            ? "Esse e-mail já tem conta. Faça login."
            : msg.includes("at least 6")
              ? "A senha precisa ter pelo menos 6 caracteres."
              : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Rematch In-house</p>
      <h1 className="mt-3 text-5xl font-bold">{mode === "signup" ? "Criar conta" : "Entre na arena"}</h1>

      {confirm ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-8">
          <p className="font-semibold">Confira seu e-mail</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Enviamos um link de confirmação para <span className="font-semibold">{email}</span>. Confirme para
            liberar o login.
          </p>
          <Button className="mt-6" onClick={() => setMode("signin")}>Voltar para o login</Button>
        </div>
      ) : (
        <form className="mt-8 flex w-full flex-col gap-3" onSubmit={submit}>
          {mode === "signup" && (
            <Input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Nome de usuário" maxLength={20} required minLength={2} />
          )}
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" required />
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              required
              minLength={6}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPass}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPass ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
            </button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {resetSent && (
            <p className="text-sm text-primary">
              Enviamos um link de recuperação para <span className="font-semibold">{email}</span>. Confira sua caixa de entrada.
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="font-display uppercase tracking-widest glow">
            {busy ? "Aguarde…" : mode === "signup" ? "Criar conta" : "Entrar"}
          </Button>
          {mode === "signin" && (
            <button
              type="button"
              onClick={sendReset}
              disabled={busy}
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Esqueci minha senha
            </button>
          )}
          <Button type="button" variant="ghost" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>
            {mode === "signup" ? "Já tenho conta" : "Não tenho conta ainda"}
          </Button>
          <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <MessageCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Depois de entrar, conecte seu Discord no Perfil para receber as calls dos times.
          </p>
        </form>
      )}
    </main>
  );
}
