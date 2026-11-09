export const DONATION_PIX = "00020126360014BR.GOV.BCB.PIX0114+55649930062655204000053039865802BR5901N6001C62070503***630482FA";
export const SUPPORTER_THRESHOLD_BRL = 5;

export async function copyDonationPix(writeText: (value: string) => Promise<void>) {
  await writeText(DONATION_PIX);
}