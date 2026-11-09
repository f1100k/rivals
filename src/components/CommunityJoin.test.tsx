import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommunityJoin, COMMUNITY_LINKS } from "./CommunityJoin";

describe("Convocação da galera", () => {
  it("aponta os dois botões para os convites reais", () => {
    render(<CommunityJoin />);

    const discord = screen.getByRole("link", { name: /Discord/i });
    const whatsapp = screen.getByRole("link", { name: /WhatsApp/i });

    expect(discord).toHaveAttribute("href", "https://discord.gg/UaTtHVmxZ");
    expect(whatsapp).toHaveAttribute("href", "https://chat.whatsapp.com/LsLazwrfL8M3LmQOamuKTl");
    expect(discord).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(discord).toHaveAttribute("rel", "noopener noreferrer");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("mantém os endereços da tela iguais aos do módulo", () => {
    render(<CommunityJoin />);
    expect(screen.getByRole("link", { name: /Discord/i })).toHaveAttribute(
      "href",
      COMMUNITY_LINKS.discord.href,
    );
    expect(screen.getByRole("link", { name: /WhatsApp/i })).toHaveAttribute(
      "href",
      COMMUNITY_LINKS.whatsapp.href,
    );
  });
});
