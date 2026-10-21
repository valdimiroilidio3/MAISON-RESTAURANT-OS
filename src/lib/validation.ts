import { z } from "zod";

export const idSchema = z.coerce.number().int().positive();

export const openOrderSchema = z.object({
  tableId: idSchema,
  guests: z.coerce.number().int().min(1, "Mínimo 1 pessoa").max(30, "Máximo 30 pessoas"),
  notes: z.string().max(300).optional().default(""),
});

export const addItemSchema = z.object({
  productId: idSchema,
  qty: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(280).optional().default(""),
  modifierIds: z.array(idSchema).max(8).optional().default([]),
});

export const updateItemSchema = z.object({
  qty: z.coerce.number().int().min(1).max(20).optional(),
  notes: z.string().max(280).optional(),
});

export const voidItemSchema = z.object({
  reason: z.string().trim().min(3, "Indique o motivo da anulação").max(280),
});

export const itemStatusSchema = z.object({
  to: z.enum(["preparing", "ready", "served"]),
});

export const discountSchema = z.object({
  discountCents: z.coerce.number().int().min(0).max(100_000),
});

export const paymentSchema = z.object({
  amountCents: z.coerce.number().int().positive("Valor deve ser positivo"),
  method: z.enum(["cash", "card", "mbway", "voucher", "transfer"]),
  reference: z.string().max(80).optional().default(""),
  idempotencyKey: z.string().min(8).max(80),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, "Indique o motivo").max(280),
});

export const tableActionSchema = z.object({
  action: z.enum(["release", "cleaning"]),
});

export const reservationSchema = z.object({
  name: z.string().trim().min(2, "Indique o seu nome").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Email inválido"),
  phone: z
    .string()
    .trim()
    .min(6, "Telefone inválido")
    .max(32)
    .refine((v) => v.replace(/\D/g, "").length >= 6, { message: "Telefone inválido" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
  partySize: z.coerce.number().int().min(1).max(10),
  note: z.string().max(400).optional().default(""),
  tableId: z.coerce.number().int().positive().optional(),
});

export const reservationStatusSchema = z.object({
  reservationId: idSchema,
  status: z.enum(["pending", "confirmed", "seated", "completed", "cancelled", "no_show"]),
  note: z.string().max(400).optional(),
});

export const assignTableSchema = z.object({
  reservationId: idSchema,
  tableId: idSchema,
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "Nome demasiado curto").max(120),
  categoryId: idSchema,
  description: z.string().max(500).optional().default(""),
  priceCents: z.coerce.number().int().min(0).max(100_000),
  allergens: z.array(z.string().max(60)).max(12).optional().default([]),
  prepMinutes: z.coerce.number().int().min(1).max(120).optional().default(12),
  course: z.enum(["starter", "main", "dessert", "drink", "side"]).optional().default("main"),
  available: z.coerce.boolean().optional().default(true),
  featured: z.coerce.boolean().optional().default(false),
  imageUrl: z.string().max(400).optional().default(""),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(200).optional().default(""),
});

export const ingredientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  unit: z.enum(["kg", "g", "L", "cl", "un"]),
  initialStock: z.coerce.number().min(0).max(1_000_000).optional().default(0),
  reorderLevel: z.coerce.number().min(0).max(1_000_000).optional().default(0),
  unitCostCents: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  supplier: z.string().max(120).optional().default(""),
});

export const stockAdjustSchema = z.object({
  ingredientId: idSchema,
  delta: z.coerce.number().finite().refine((v) => v !== 0, { message: "Movimento não pode ser zero" }),
  reason: z.string().trim().min(3, "Indique o motivo").max(200),
});

export const ingredientMetaSchema = z.object({
  ingredientId: idSchema,
  reorderLevel: z.coerce.number().min(0).max(100_000).optional(),
  unitCostCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
  supplier: z.string().max(120).optional(),
});

export const recipeSchema = z.object({
  productId: idSchema,
  lines: z
    .array(z.object({ ingredientId: idSchema, qty: z.coerce.number().positive().max(10_000) }))
    .max(40),
});

export const settingsSchema = z.object({
  tagline: z.string().max(200).default(""),
  address: z.string().max(240).default(""),
  phone: z.string().min(6).max(40),
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Email inválido"),
  lunchHours: z.string().max(40),
  dinnerHours: z.string().max(40),
  taxRateBps: z.coerce.number().int().min(0).max(3000),
  pricesIncludeTax: z.boolean(),
  serviceChargeBps: z.coerce.number().int().min(0).max(2000),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(10),
});

export function formToObject(formData: FormData): Record<string, FormDataEntryValue> {
  const values: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (values[key] === undefined) values[key] = value;
  }
  return values;
}

export function zodMessage(error: z.ZodError): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { message: Object.values(fieldErrors)[0] ?? "Dados inválidos", fieldErrors };
}
