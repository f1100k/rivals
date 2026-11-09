import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha · Inhouse Rematch" },
      { name: "description", content: "Crie uma nova senha para voltar a jogar no Inhouse Rematch." },
      { property: "og:title", content: "Nova senha · Inhouse Rematch" },
      { property: "og:description", content: "Crie uma nova senha para voltar a jogar no Inhouse Rematch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type Status = "checking" | "ready" | "invalid" | "done";

/** Reads an auth error the email link may carry in the URL (hash or query). */
function readLinkError(): string | null {
  const raw = `${window.location.hash.replace(/^#/, "")}&${window.location.search.replace(/^\?/, "")}`;
  const params = new URLSearchParams(raw);
  const code = params.get("error_code") ?? params.get("error");
  if (!code) return null;
  if (code.includes("expired") || code === "access_denied") {
    return "Esse link já foi usado ou expirou. Peça um novo link e abra só o e-mail mais recente.";
  }
  return params.get("error_description")?.replace(/\+/g, " ") ?? "Link inválido.";
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const err = readLinkError();
    if (err) {
      setLinkError(err);
      setStatus("invalid");
      return;
    }
    let settled = false;
    const markReady = () => {
      settled = true;
      setStatus((s) => (s === "checking" ? "ready" : s));
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) markReady();
    });
    // The link's session may already be stored before this page mounts.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });
    const timer = window.setTimeout(() => {
      if (!settled) {
        setLinkError("Não encontramos um link de recuperação válido. Peça um novo link na tela de login.");
        setStatus("invalid");
      }
    }, 4000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As duas senhas não são iguais.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setStatus("done");
      window.setTimeout(() => navigate({ to: "/inicio", replace: true }), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.includes("at least 6")
          ? "A senha precisa ter pelo menos 6 caracteres."
          : msg.toLowerCase().includes("different from the old")
            ? "A nova senha precisa ser diferente da antiga."
            : msg.toLowerCase().includes("weak") || msg.toLowerCase().includes("pwned")
              ? "Essa senha é muito fraca ou já vazou na internet. Escolha outra."
              : msg.toLowerCase().includes("session")
                ? "O link expirou. Peça um novo link na tela de login."
                : msg || "Não foi possível trocar a senha.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Rematch In-house</p>
      <h1 className="mt-3 text-5xl font-bold">Nova senha</h1>

      {status === "checking" && <p className="mt-8 text-sm text-muted-foreground">Conferindo seu link…</p>}

      {status === "invalid" && (
        <div className="mt-8 w-full rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-destructive">{linkError}</p>
          <Button asChild className="mt-6">
            <Link to="/auth">Voltar e pedir novo link</Link>
          </Button>
        </div>
      )}

      {status === "done" && (
        <p className="mt-8 font-semibold text-primary">Senha trocada! Entrando…</p>
      )}

      {status === "ready" && (
        <form className="mt-8 flex w-full flex-col gap-3" onSubmit={save}>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nova senha"
              autoComplete="new-password"
              required
              minLength={6}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
            </button>
          </div>
          <Input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a nova senha"
            autoComplete="new-password"
            required
            minLength={6}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" disabled={busy} className="font-display uppercase tracking-widest glow">
            {busy ? "Aguarde…" : "Salvar nova senha"}
          </Button>
        </form>
      )}
    </main>
  );
}
