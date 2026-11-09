import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, Heart, Image, ScanLine, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import qrCode from "@/assets/qrcode-pix.png.asset.json";
import { copyDonationPix, DONATION_PIX, SUPPORTER_THRESHOLD_BRL } from "@/lib/donations";

export const Route = createFileRoute("/doacao")({
  head: () => ({
    meta: [
      { title: "Doação · Inhouse Rematch" },
      { name: "description", content: "Apoie o Inhouse Rematch com qualquer valor via Pix e ajude a manter o site e melhorar a comunidade." },
      { property: "og:title", content: "Apoie o Inhouse Rematch" },
      { property: "og:description", content: "Contribua via Pix para manter e melhorar o site. Doações acima de R$ 5 recebem benefícios de apoiador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DonationPage,
});

function DonationPage() {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function copyPix() {
    if (copying) return;
    setCopying(true);
    try {
      await copyDonationPix((value) => navigator.clipboard.writeText(value));
      setCopied(true);
      toast.success("Pix copiado!");
    } catch {
      setCopied(false);
      toast.error("Não foi possível copiar. Selecione o código abaixo e copie manualmente.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="mb-10 max-w-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
          <Heart className="h-4 w-4" aria-hidden /> Pela nossa comunidade
        </div>
        <h1 className="text-4xl font-bold sm:text-5xl">Apoie o Inhouse</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Olá, pessoal! Esta página existe para que possamos continuar mantendo o site e melhorando cada vez mais.
          Sua doação ajuda a manter a nossa comunidade em jogo — e qualquer valor faz a diferença.
        </p>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
        <section aria-labelledby="pix-heading" className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pix-heading" className="text-xl font-bold">Doar com Pix</h2>
            <ScanLine className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Qualquer valor. Toda ajuda conta.</p>
          <img src={qrCode.url} alt="QR Code Pix para doar ao Inhouse" width={280} height={280} className="mx-auto my-6 aspect-square w-full max-w-[280px] rounded-md" />
          <label htmlFor="pix-code" className="mb-2 block text-sm font-semibold">Pix copia e cola</label>
          <textarea id="pix-code" readOnly value={DONATION_PIX} rows={4} spellCheck={false} className="block w-full resize-none break-all rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button onClick={copyPix} disabled={copying} className="mt-3 w-full gap-2" size="lg">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado! Copiar novamente" : "Copiar código Pix"}
          </Button>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Confira os dados do destinatário no seu banco antes de confirmar a doação.
          </p>
        </section>

        <section aria-labelledby="supporter-heading" className="min-w-0 py-2">
          <div className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" aria-hidden /> Acima de R$ {SUPPORTER_THRESHOLD_BRL}
          </div>
          <h2 id="supporter-heading" className="text-2xl font-bold sm:text-3xl">Um agradecimento especial</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Doando acima de R$ {SUPPORTER_THRESHOLD_BRL}, você ganha benefícios exclusivos para deixar sua marca na comunidade.
          </p>
          <ul className="mt-7 divide-y divide-border">
            <li className="flex gap-4 py-5">
              <Tag className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
              <div><h3 className="font-bold">Tag exclusiva de apoiador</h3><p className="mt-1 text-sm text-muted-foreground">Um título ao lado do seu nome para mostrar que você apoia o Inhouse.</p></div>
            </li>
            <li className="flex gap-4 py-5">
              <Sparkles className="mt-1 h-6 w-6 shrink-0 text-accent" aria-hidden />
              <div><h3 className="font-bold">Moldura de apoiador</h3><p className="mt-1 text-sm text-muted-foreground">Uma moldura para destacar sua foto de perfil.</p></div>
            </li>
            <li className="flex gap-4 py-5">
              <Image className="mt-1 h-6 w-6 shrink-0 text-team-a" aria-hidden />
              <div><h3 className="font-bold">Banner personalizado</h3><p className="mt-1 text-sm text-muted-foreground">Liberação para personalizar o banner do seu perfil.</p></div>
            </li>
          </ul>
          <div className="mt-6 border-l-2 border-primary pl-4 text-sm leading-relaxed text-muted-foreground">
            Após doar, envie o comprovante e seu nome de jogador à administração pelo Discord. Os benefícios são liberados após a confirmação da doação, não automaticamente pelo Pix.
          </div>
          <p className="mt-8 font-display font-semibold">Obrigado por fazer parte disso. <Heart className="ml-1 inline h-4 w-4 text-primary" aria-hidden /></p>
        </section>
      </div>
    </main>
  );
}