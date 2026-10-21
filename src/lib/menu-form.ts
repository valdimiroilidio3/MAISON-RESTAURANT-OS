import { z } from "zod";
import { parseMoneyToCents } from "./money";

/** Shared (client-safe) helpers for the menu forms. */
export const createProductSchemaCompat = {
  course: z.enum(["starter", "main", "dessert", "drink", "side"]),
};

export const COURSE_OPTIONS = [
  { value: "starter", label: "Entrada" },
  { value: "main", label: "Prato principal" },
  { value: "dessert", label: "Sobremesa" },
  { value: "drink", label: "Bebida" },
  { value: "side", label: "Acompanhamento" },
] as const;

export const ALLERGEN_OPTIONS = [
  "Glúten",
  "Leite",
  "Ovo",
  "Peixe",
  "Moluscos",
  "Crustáceos",
  "Frutos de casca rija",
  "Soja",
  "Mostarda",
  "Sulfitos",
  "Sésamo",
  "Tremoço",
] as const;

export function menuPriceToCents(raw: string): number {
  const cents = parseMoneyToCents(raw);
  if (cents == null) throw new Error("Preço inválido. Use o formato 12,50.");
  if (cents < 0 || cents > 100_000) throw new Error("Preço fora do intervalo permitido.");
  return cents;
}
