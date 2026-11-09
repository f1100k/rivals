import { describe, expect, it } from "vitest";
import { discordRedirectFor } from "./DiscordLinkCard";

describe("volta do Discord", () => {
  it("no domínio rivalsinhouse.app volta pelo endereço cadastrado no Discord", () => {
    expect(discordRedirectFor("https://rivalsinhouse.app")).toBe("https://level-up-rematch-hub.lovable.app/perfil");
    expect(discordRedirectFor("https://www.rivalsinhouse.app")).toBe("https://level-up-rematch-hub.lovable.app/perfil");
  });

  it("endereços já cadastrados voltam para eles mesmos", () => {
    const preview = "https://id-preview--65ac68b6-10ae-4672-8626-ae4642662b17.lovable.app";
    expect(discordRedirectFor(preview)).toBe(`${preview}/perfil`);
    expect(discordRedirectFor("https://level-up-rematch-hub.lovable.app")).toBe("https://level-up-rematch-hub.lovable.app/perfil");
  });
});
