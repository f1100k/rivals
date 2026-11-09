/** Features admins can unlock for individual players. Every key must exist in the database check list
 * (the database may keep retired keys such as "shop", which is no longer needed now that the Loja is open to everyone). */
export const FEATURES = [
  { key: "banner", label: "Banner personalizado", description: "Pode enviar um banner no próprio perfil." },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

export function featureLabel(key: string) {
  return FEATURES.find(f => f.key === key)?.label ?? key;
}
