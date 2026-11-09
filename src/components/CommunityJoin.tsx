import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Convocação da galera: Discord (calls e avisos) e WhatsApp (grupo do dia a dia).
 * Os endereços ficam num único lugar para não divergirem do convite real do servidor.
 */
export const COMMUNITY_LINKS = {
  discord: {
    href: "https://discord.gg/UaTtHVmxZ",
    prefix: "Entrar no",
    name: "Discord",
  },
  whatsapp: {
    href: "https://chat.whatsapp.com/LsLazwrfL8M3LmQOamuKTl",
    prefix: "Entrar no",
    name: "WhatsApp",
  },
} as const;

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 6.002 3.03.077.077 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.01c.12.099.246.198.372.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.872.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.175 1.095 2.156 2.419 0 1.333-.946 2.419-2.156 2.419z" />
    </svg>
  );
}

function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

export function CommunityJoin() {
  return (
    <section
      aria-labelledby="convocar-titulo"
      className="relative overflow-hidden rounded-2xl border border-primary/40 bg-card p-4 shadow-[0_0_40px_-18px_var(--color-primary)] md:p-7"
    >
      {/* Brilho de marca nos cantos: chama o olho sem tapar o texto. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-discord/25 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-whatsapp/20 blur-3xl"
      />

      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-5">
        <div className="max-w-xl space-y-2">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <span className="relative grid h-2.5 w-2.5 place-items-center">
              <span className="absolute inset-0 rounded-full bg-primary animate-ring" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Convocação
          </p>
          <h2 id="convocar-titulo" className="font-display text-xl font-bold leading-tight md:text-3xl">
            Sem equipe completa, a partida não começa.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Entre no servidor e no grupo para reunir os jogadores e abrir a fila. É no servidor que
            as calls são organizadas.
          </p>
        </div>

        <div className="flex flex-row gap-2 md:flex-col md:gap-3 lg:flex-row">
          <Button
            asChild
            size="lg"
            className="h-11 flex-1 bg-discord px-3 font-display text-sm uppercase text-discord-foreground shadow-[0_0_25px_-10px_var(--color-discord)] hover:bg-discord/90 sm:px-5 md:h-12 md:flex-none md:px-6 md:text-base"
          >
            <a href={COMMUNITY_LINKS.discord.href} target="_blank" rel="noopener noreferrer">
              <DiscordMark className="h-5 w-5" />
              <span className="hidden sm:inline">{COMMUNITY_LINKS.discord.prefix} </span>
              {COMMUNITY_LINKS.discord.name}
              <ArrowUpRight className="h-4 w-4 opacity-70" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            className="h-11 flex-1 bg-whatsapp px-3 font-display text-sm uppercase text-whatsapp-foreground shadow-[0_0_25px_-10px_var(--color-whatsapp)] hover:bg-whatsapp/90 sm:px-5 md:h-12 md:flex-none md:px-6 md:text-base"
          >
            <a href={COMMUNITY_LINKS.whatsapp.href} target="_blank" rel="noopener noreferrer">
              <WhatsAppMark className="h-5 w-5" />
              <span className="hidden sm:inline">{COMMUNITY_LINKS.whatsapp.prefix} </span>
              {COMMUNITY_LINKS.whatsapp.name}
              <ArrowUpRight className="h-4 w-4 opacity-70" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
