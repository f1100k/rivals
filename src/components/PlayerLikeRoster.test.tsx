import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerLikeRoster } from "./PlayerLikeRoster";
vi.mock("./ProfileTags", () => ({ EquippedProfileTag: () => null }));
vi.mock("./Emblems", () => ({ EquippedEmblem: () => null }));
vi.mock("./NameFonts", () => ({ PlayerName: ({ name }: { name: string }) => <>{name}</> }));

describe("active-match likes", () => {
  it("prevents submitting a like before match completion", () => {
    const onLike = vi.fn();
    render(<PlayerLikeRoster players={[{ userId: "teammate", name: "Companheiro", liked: false }]} pending={null} disabled onLike={onLike} />);
    const button = screen.getByRole("button", { name: "Curtir Companheiro" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onLike).not.toHaveBeenCalled();
  });
});