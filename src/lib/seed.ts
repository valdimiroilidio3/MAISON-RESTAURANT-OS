import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./password";
import { computeOrderTotals } from "./pricing";
import { localDate, zonedToUtcIso } from "./dates";

/**
 * Deterministic demo dataset. Runs once when the database file is created.
 * All operational rows (orders); the restaurant-facing content (menu, zones,
 * tables, reservations) is exactly what the admin panels edit later.
 */

type SeedOrderItem = {
  name: string;
  qty: number;
  status: "draft" | "sent" | "preparing" | "ready" | "served" | "void";
  notes?: string;
  modifiers?: string[];
  course?: string;
  minutesAgo?: number;
};

type SeedPayment = {
  amountCents: number;
  method: "cash" | "card" | "mbway" | "voucher" | "transfer";
  status: "recorded" | "confirmed";
  at: string;
  reference?: string;
};

type SeedOrder = {
  number: number;
  tableCode: string;
  guests: number;
  waiterId: number;
  status: "open" | "sent" | "partially_ready" | "ready" | "served" | "awaiting_payment" | "paid" | "cancelled";
  paymentStatus: "unpaid" | "pending" | "recorded" | "confirmed";
  openedAt: string;
  closedAt?: string | null;
  notes?: string;
  discountCents?: number;
  items: SeedOrderItem[];
  payments?: SeedPayment[];
};

export function seedDatabase(db: DatabaseSync): void {
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const today = localDate(0);
  const atToday = (time: string) => zonedToUtcIso(today, time);
  const atDay = (offset: number, time: string) => zonedToUtcIso(localDate(offset), time);

  const insertRestaurant = db.prepare(`
    INSERT INTO restaurants (slug,name,tagline,currency,tax_rate_bps,prices_include_tax,service_charge_bps,
      timezone,address,phone,email,lunch_hours,dinner_hours,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertRestaurant.run(
    "maison",
    "MAISON®",
    "Cozinha de autor, fogo e tempo. Lisboa.",
    "EUR",
    2300,
    1,
    0,
    "Europe/Lisbon",
    "Rua das Flores 84, 1200-194 Lisboa",
    "+351 213 456 789",
    "reservas@maison.pt",
    "12:00 – 15:00",
    "19:00 – 23:00",
    new Date(now).toISOString(),
  );
  const restaurantId = Number((db.prepare("SELECT id FROM restaurants WHERE slug='maison'").get() as { id: number }).id);

  const insertUser = db.prepare(
    "INSERT INTO users (restaurant_id,name,email,password_hash,role,active,created_at) VALUES (?,?,?,?,?,1,?)",
  );
  const users: { id: number; name: string; role: string }[] = [];
  const staff = [
    { name: "Ana Ferreira", email: "manager@maison.pt", role: "manager" },
    { name: "Diogo Marques", email: "waiter@maison.pt", role: "waiter" },
    { name: "Sofia Lopes", email: "chef@maison.pt", role: "chef" },
    { name: "Rui Almeida", email: "rui@maison.pt", role: "waiter" },
    { name: "Marta Nunes", email: "marta@maison.pt", role: "chef" },
  ] as const;
  const demoHash = hashPassword("Maison!2026");
  for (const person of staff) {
    const res = insertUser.run(restaurantId, person.name, person.email, demoHash, person.role, ago(60 * 24 * 120));
    users.push({ id: Number(res.lastInsertRowid), name: person.name, role: person.role });
  }
  const waiterDiogo = users[1].id;
  const waiterRui = users[3].id;
  const chefSofia = users[2].id;
  const managerAna = users[0].id;

  // ---- Zones & tables -------------------------------------------------------
  const insertZone = db.prepare("INSERT INTO zones (restaurant_id,name,slug,sort_order) VALUES (?,?,?,?)");
  const zoneDefs = [
    { name: "Esplanada", slug: "esplanada" },
    { name: "Sala", slug: "sala" },
    { name: "Balcão", slug: "balcao" },
  ];
  const zones: Record<string, number> = {};
  zoneDefs.forEach((z, i) => {
    const res = insertZone.run(restaurantId, z.name, z.slug, i);
    zones[z.slug] = Number(res.lastInsertRowid);
  });

  const insertTable = db.prepare(
    "INSERT INTO tables (restaurant_id,zone_id,code,seats,shape,pos_x,pos_z,rotation,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  );
  const tableDefs: {
    code: string;
    zone: string;
    seats: number;
    shape: "round" | "rect";
    x: number;
    z: number;
    rotation?: number;
  }[] = [
    { code: "T01", zone: "esplanada", seats: 2, shape: "round", x: -9.4, z: -5.6 },
    { code: "T02", zone: "esplanada", seats: 2, shape: "round", x: -6.8, z: -5.6 },
    { code: "T03", zone: "esplanada", seats: 4, shape: "round", x: -9.4, z: -2.8 },
    { code: "T04", zone: "esplanada", seats: 4, shape: "round", x: -6.6, z: -2.8 },
    { code: "T05", zone: "esplanada", seats: 4, shape: "rect", x: -9.2, z: 0.1, rotation: 0 },
    { code: "T06", zone: "esplanada", seats: 4, shape: "rect", x: -6.6, z: 0.2, rotation: 0 },
    { code: "T20", zone: "esplanada", seats: 2, shape: "round", x: -9.3, z: 3.4 },
    { code: "T07", zone: "sala", seats: 6, shape: "rect", x: -2.6, z: -3.6 },
    { code: "T08", zone: "sala", seats: 4, shape: "rect", x: 0.5, z: -3.6 },
    { code: "T09", zone: "sala", seats: 4, shape: "round", x: -2.6, z: -0.4 },
    { code: "T10", zone: "sala", seats: 2, shape: "round", x: 0.7, z: -0.4 },
    { code: "T11", zone: "sala", seats: 2, shape: "round", x: -2.6, z: 2.7 },
    { code: "T12", zone: "sala", seats: 6, shape: "rect", x: 0.3, z: 3.3 },
    { code: "T13", zone: "balcao", seats: 4, shape: "round", x: 4.0, z: -2.5 },
    { code: "T14", zone: "balcao", seats: 8, shape: "rect", x: 5.4, z: -0.5 },
    { code: "T15", zone: "balcao", seats: 2, shape: "round", x: 3.4, z: 1.5 },
    { code: "T16", zone: "balcao", seats: 2, shape: "round", x: 6.7, z: 1.9 },
    { code: "T17", zone: "balcao", seats: 2, shape: "round", x: 4.2, z: 4.3 },
    { code: "T18", zone: "balcao", seats: 4, shape: "rect", x: 6.7, z: 4.6 },
    { code: "T19", zone: "balcao", seats: 4, shape: "round", x: 3.3, z: 6.4 },
  ];
  const tableIds: Record<string, number> = {};
  for (const t of tableDefs) {
    const res = insertTable.run(
      restaurantId,
      zones[t.zone],
      t.code,
      t.seats,
      t.shape,
      t.x,
      t.z,
      t.rotation ?? 0,
      "available",
      ago(1),
    );
    tableIds[t.code] = Number(res.lastInsertRowid);
  }
  const updateTableStatus = db.prepare("UPDATE tables SET status=?, updated_at=? WHERE id=?");
  const statusByCode: Record<string, string> = {
    T03: "occupied",
    T07: "order_pending",
    T08: "awaiting_payment",
    T11: "occupied",
    T14: "order_pending",
    T13: "cleaning",
    T02: "reserved",
    T05: "reserved",
    T09: "reserved",
    T12: "reserved",
  };
  for (const [code, status] of Object.entries(statusByCode)) {
    updateTableStatus.run(status, ago(3), tableIds[code]);
  }

  // ---- Menu -----------------------------------------------------------------
  const insertCategory = db.prepare(
    "INSERT INTO categories (restaurant_id,name,slug,description,sort_order) VALUES (?,?,?,?,?)",
  );
  const categories = [
    { name: "Entradas", slug: "entradas", description: "Para abrir o apetite, em pequenas porções." },
    { name: "Pratos", slug: "pratos", description: "Cozinha de autor, sazonal e de origem controlada." },
    { name: "Brasa", slug: "brasa", description: "Fogo vivo, cortes maturados e peixe do dia." },
    { name: "Sobremesas", slug: "sobremesas", description: "O final, sem pressa." },
    { name: "Bar", slug: "bar", description: "Cocktails de autor, vinhos e cafetaria." },
  ];
  const categoryIds: Record<string, number> = {};
  categories.forEach((c, i) => {
    const res = insertCategory.run(restaurantId, c.name, c.slug, c.description, i);
    categoryIds[c.slug] = Number(res.lastInsertRowid);
  });

  const insertProduct = db.prepare(`
    INSERT INTO products (restaurant_id,category_id,name,description,price_cents,available,allergens,prep_minutes,
      course,image_url,featured,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const products: {
    name: string;
    cat: string;
    price: number;
    desc: string;
    allergens?: string[];
    prep?: number;
    course?: string;
    image?: string;
    featured?: boolean;
    available?: boolean;
  }[] = [
    {
      name: "Crudo de robalo",
      cat: "entradas",
      price: 1600,
      desc: "Robalo selvagem, citrinos da estação, azeite virgem extra e pimenta rosa. Corte do dia.",
      allergens: ["Peixe"],
      prep: 6,
      course: "starter",
      image: "/images/dish-crudo.jpg",
      featured: true,
    },
    {
      name: "Burrata fumada",
      cat: "entradas",
      price: 1450,
      desc: "Burrata de Andria fumada na hora, tomate heirloom, manjericão e pão de fermentação lenta.",
      allergens: ["Leite", "Glúten"],
      prep: 7,
      course: "starter",
    },
    {
      name: "Tartar de novilho",
      cat: "entradas",
      price: 1550,
      desc: "Novilho maturado cortado à faca, mostarda antiga, alcaparras e gema curada.",
      allergens: ["Ovo", "Mostarda"],
      prep: 8,
      course: "starter",
    },
    {
      name: "Pão de fermentação lenta",
      cat: "entradas",
      price: 650,
      desc: "Massa mãe de 48 horas, manteiga de algas e flor de sal.",
      allergens: ["Glúten", "Leite"],
      prep: 4,
      course: "starter",
    },
    {
      name: "Risotto de açafrão",
      cat: "pratos",
      price: 2400,
      desc: "Carnaroli, açafrão de La Mancha, manteiga noisette e parmesão de 24 meses.",
      allergens: ["Leite"],
      prep: 18,
      course: "main",
      image: "/images/dish-risotto.jpg",
      featured: true,
    },
    {
      name: "Robalo selvagem",
      cat: "pratos",
      price: 3200,
      desc: "Lombo de robalo, grelos, molho de manteiga e limão confitado.",
      allergens: ["Peixe", "Leite"],
      prep: 22,
      course: "main",
    },
    {
      name: "Pato assado",
      cat: "pratos",
      price: 2900,
      desc: "Peito de pato de Bresse, beterraba assada e redução de vinho do Porto.",
      allergens: ["Sulfitos"],
      prep: 24,
      course: "main",
    },
    {
      name: "Cogumelos silvestres",
      cat: "pratos",
      price: 2200,
      desc: "Cogumelos da serra, polenta cremosa e azeite de ervas. Vegetariano.",
      allergens: ["Leite"],
      prep: 16,
      course: "main",
    },
    {
      name: "Picanha maturada 45 dias",
      cat: "brasa",
      price: 3400,
      desc: "Picanha maturada, sal de brasa, batata confitada e molho de carne.",
      allergens: ["Leite"],
      prep: 26,
      course: "main",
      image: "/images/dish-picanha.jpg",
      featured: true,
    },
    {
      name: "Costeleta de novilho",
      cat: "brasa",
      price: 6800,
      desc: "Costeleta para dois, 900 g, legumes à brasa e molho béarnaise.",
      allergens: ["Leite", "Ovo"],
      prep: 32,
      course: "main",
    },
    {
      name: "Polvo à brasa",
      cat: "brasa",
      price: 3100,
      desc: "Polvo dos Açores, batata a murro, pimentão fumado e azeite.",
      allergens: ["Moluscos"],
      prep: 24,
      course: "main",
    },
    {
      name: "Legumes à brasa",
      cat: "brasa",
      price: 1800,
      desc: "Legumes da horta, romesco de amêndoa e ervas frescas. Vegano.",
      allergens: ["Frutos de casca rija"],
      prep: 14,
      course: "main",
    },
    {
      name: "Pastel de nata caramelizado",
      cat: "sobremesas",
      price: 550,
      desc: "Folha estaladiça, creme de baunilha e canela do Ceilão.",
      allergens: ["Glúten", "Leite", "Ovo"],
      prep: 5,
      course: "dessert",
    },
    {
      name: "Chocolate 70%",
      cat: "sobremesas",
      price: 900,
      desc: "Ganache de chocolate de São Tomé, azeite e flor de sal.",
      allergens: ["Leite"],
      prep: 6,
      course: "dessert",
      image: "/images/dish-dessert.jpg",
      featured: true,
    },
    {
      name: "Tarte de limão e merengue",
      cat: "sobremesas",
      price: 850,
      desc: "Limão do Algarve, merengue queimado e crumble de amêndoa.",
      allergens: ["Glúten", "Leite", "Ovo", "Frutos de casca rija"],
      prep: 6,
      course: "dessert",
    },
    {
      name: "Queijo de ovelha da serra",
      cat: "sobremesas",
      price: 1100,
      desc: "Três queijos curados, marmelada de membrilho e tostas.",
      allergens: ["Leite", "Glúten"],
      prep: 4,
      course: "dessert",
    },
    {
      name: "Gin tónica da casa",
      cat: "bar",
      price: 1200,
      desc: "Gin infusionado com zimbro e rosmaninho, tónica artesanal e citrinos.",
      allergens: [],
      prep: 3,
      course: "drink",
    },
    {
      name: "Vinho tinto Douro",
      cat: "bar",
      price: 850,
      desc: "Copo de tinto de produtor, Touriga Nacional e Touriga Franca. 15 cl.",
      allergens: ["Sulfitos"],
      prep: 1,
      course: "drink",
    },
    {
      name: "Espresso",
      cat: "bar",
      price: 220,
      desc: "Blend da casa, torra média, origem Brasil e Etiópia.",
      allergens: [],
      prep: 1,
      course: "drink",
    },
    {
      name: "Água com gás 0,75 L",
      cat: "bar",
      price: 350,
      desc: "Água mineral gaseificada, garrafa de vidro.",
      allergens: [],
      prep: 1,
      course: "drink",
    },
    {
      name: "Óleo de trufa (extra)",
      cat: "bar",
      price: 600,
      desc: "Extra de trufa negra para qualquer prato.",
      allergens: [],
      prep: 1,
      course: "drink",
      available: false,
    },
  ];

  const productIds: Record<string, number> = {};
  const productPrice: Record<string, number> = {};
  products.forEach((p, i) => {
    const res = insertProduct.run(
      restaurantId,
      categoryIds[p.cat],
      p.name,
      p.desc,
      p.price,
      p.available === false ? 0 : 1,
      JSON.stringify(p.allergens ?? []),
      p.prep ?? 12,
      p.course ?? "main",
      p.image ?? null,
      p.featured ? 1 : 0,
      i,
      ago(60 * 24 * 90),
      ago(60),
    );
    productIds[p.name] = Number(res.lastInsertRowid);
    productPrice[p.name] = p.price;
  });

  const insertModifier = db.prepare(
    "INSERT INTO modifiers (restaurant_id,name,price_delta_cents,group_name,sort_order,active) VALUES (?,?,?,?,?,1)",
  );
  const modifiers = [
    { name: "Extra trufa negra", delta: 600, group: "Extras" },
    { name: "Ovo escalfado", delta: 300, group: "Extras" },
    { name: "Dose extra de pão", delta: 300, group: "Extras" },
    { name: "Manteiga de algas", delta: 250, group: "Extras" },
    { name: "Sem glúten", delta: 0, group: "Preferências" },
    { name: "Sem lactose", delta: 0, group: "Preferências" },
    { name: "Molho à parte", delta: 0, group: "Preferências" },
    { name: "Bem passado", delta: 0, group: "Preparação" },
    { name: "Mal passado", delta: 0, group: "Preparação" },
  ] as const;
  const modifierByKey: Record<string, { id: number; name: string; priceDeltaCents: number }> = {};
  modifiers.forEach((m, i) => {
    const res = insertModifier.run(restaurantId, m.name, m.delta, m.group, i);
    modifierByKey[m.name] = { id: Number(res.lastInsertRowid), name: m.name, priceDeltaCents: m.delta };
  });

  // ---- Ingredients & recipes ------------------------------------------------
  const insertIngredient = db.prepare(`
    INSERT INTO ingredients (restaurant_id,name,unit,stock_qty,reorder_level,unit_cost_cents,supplier,created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const ingredients = [
    { name: "Robalo selvagem", unit: "kg", stock: 14, reorder: 5, cost: 2200, supplier: "Docapesca" },
    { name: "Burrata", unit: "kg", stock: 6, reorder: 2, cost: 1650, supplier: "Latteria Andria" },
    { name: "Novilho maturado", unit: "kg", stock: 18, reorder: 6, cost: 3400, supplier: "Carnes do Ribatejo" },
    { name: "Picanha", unit: "kg", stock: 12, reorder: 5, cost: 2900, supplier: "Carnes do Ribatejo" },
    { name: "Pato de Bresse", unit: "kg", stock: 8, reorder: 3, cost: 2600, supplier: "Avícola do Oeste" },
    { name: "Arroz carnaroli", unit: "kg", stock: 20, reorder: 6, cost: 420, supplier: "Mercearia Central" },
    { name: "Açafrão", unit: "kg", stock: 0.05, reorder: 0.1, cost: 90000, supplier: "Especiaria Fina" },
    { name: "Cogumelos silvestres", unit: "kg", stock: 9, reorder: 3, cost: 1800, supplier: "Horta da Serra" },
    { name: "Batata", unit: "kg", stock: 25, reorder: 10, cost: 95, supplier: "Horta da Serra" },
    { name: "Limão", unit: "kg", stock: 8, reorder: 3, cost: 190, supplier: "Fruta do Algarve" },
    { name: "Tomate heirloom", unit: "kg", stock: 10, reorder: 4, cost: 320, supplier: "Horta da Serra" },
    { name: "Ovos", unit: "un", stock: 90, reorder: 30, cost: 32, supplier: "Quinta dos Ovos" },
    { name: "Farinha", unit: "kg", stock: 15, reorder: 5, cost: 110, supplier: "Mercearia Central" },
    { name: "Manteiga", unit: "kg", stock: 7, reorder: 3, cost: 1250, supplier: "Lácteos do Norte" },
    { name: "Chocolate 70%", unit: "kg", stock: 4, reorder: 1.5, cost: 2100, supplier: "Cacau São Tomé" },
    { name: "Queijo de ovelha", unit: "kg", stock: 6, reorder: 2, cost: 2400, supplier: "Serra da Estrela" },
    { name: "Vinho tinto Douro", unit: "L", stock: 24, reorder: 8, cost: 900, supplier: "Garrafa & Companhia" },
    { name: "Gin", unit: "L", stock: 6, reorder: 2, cost: 3200, supplier: "Garrafa & Companhia" },
    { name: "Água mineral", unit: "un", stock: 120, reorder: 36, cost: 60, supplier: "Mercearia Central" },
    { name: "Grelos", unit: "kg", stock: 6, reorder: 2, cost: 210, supplier: "Horta da Serra" },
    { name: "Azeite virgem extra", unit: "L", stock: 9, reorder: 3, cost: 1100, supplier: "Azeites do Alentejo" },
    { name: "Sal", unit: "kg", stock: 5, reorder: 1, cost: 120, supplier: "Salinas de Rio Maior" },
  ];
  const ingredientIds: Record<string, number> = {};
  const ingredientStock: Record<string, number> = {};
  for (const ing of ingredients) {
    const res = insertIngredient.run(
      restaurantId,
      ing.name,
      ing.unit,
      ing.stock,
      ing.reorder,
      ing.cost,
      ing.supplier,
      ago(60 * 24 * 90),
    );
    ingredientIds[ing.name] = Number(res.lastInsertRowid);
    ingredientStock[ing.name] = ing.stock;
  }
  const insertMovement = db.prepare(`
    INSERT INTO stock_movements (restaurant_id,ingredient_id,delta,reason,order_id,actor_id,created_at)
    VALUES (?,?,?,?,?,?,?)`);
  for (const ing of ingredients) {
    insertMovement.run(restaurantId, ingredientIds[ing.name], ing.stock, "Contagem inicial", null, managerAna, ago(60 * 30));
  }
  insertMovement.run(restaurantId, ingredientIds["Açafrão"], -0.02, "Consumo interno", null, chefSofia, ago(60 * 6));
  insertMovement.run(restaurantId, ingredientIds["Vinho tinto Douro"], -1.5, "Prova de sala", null, waiterDiogo, ago(60 * 9));

  const recipes: Record<string, { ingredient: string; qty: number }[]> = {
    "Crudo de robalo": [
      { ingredient: "Robalo selvagem", qty: 0.12 },
      { ingredient: "Limão", qty: 0.05 },
      { ingredient: "Azeite virgem extra", qty: 0.01 },
    ],
    "Burrata fumada": [
      { ingredient: "Burrata", qty: 0.12 },
      { ingredient: "Tomate heirloom", qty: 0.15 },
      { ingredient: "Farinha", qty: 0.04 },
    ],
    "Tartar de novilho": [
      { ingredient: "Novilho maturado", qty: 0.14 },
      { ingredient: "Ovos", qty: 1 },
      { ingredient: "Limão", qty: 0.02 },
    ],
    "Pão de fermentação lenta": [
      { ingredient: "Farinha", qty: 0.09 },
      { ingredient: "Manteiga", qty: 0.01 },
    ],
    "Risotto de açafrão": [
      { ingredient: "Arroz carnaroli", qty: 0.09 },
      { ingredient: "Açafrão", qty: 0.0001 },
      { ingredient: "Manteiga", qty: 0.03 },
    ],
    "Robalo selvagem": [
      { ingredient: "Robalo selvagem", qty: 0.25 },
      { ingredient: "Grelos", qty: 0.12 },
      { ingredient: "Manteiga", qty: 0.02 },
    ],
    "Pato assado": [{ ingredient: "Pato de Bresse", qty: 0.24 }],
    "Cogumelos silvestres": [
      { ingredient: "Cogumelos silvestres", qty: 0.18 },
      { ingredient: "Manteiga", qty: 0.02 },
    ],
    "Picanha maturada 45 dias": [
      { ingredient: "Picanha", qty: 0.32 },
      { ingredient: "Batata", qty: 0.18 },
      { ingredient: "Sal", qty: 0.005 },
    ],
    "Costeleta de novilho": [
      { ingredient: "Novilho maturado", qty: 0.9 },
      { ingredient: "Batata", qty: 0.3 },
      { ingredient: "Manteiga", qty: 0.04 },
    ],
    "Polvo à brasa": [{ ingredient: "Batata", qty: 0.22 }],
    "Legumes à brasa": [{ ingredient: "Tomate heirloom", qty: 0.15 }],
    "Pastel de nata caramelizado": [
      { ingredient: "Farinha", qty: 0.03 },
      { ingredient: "Manteiga", qty: 0.02 },
      { ingredient: "Ovos", qty: 1 },
    ],
    "Chocolate 70%": [{ ingredient: "Chocolate 70%", qty: 0.06 }],
    "Tarte de limão e merengue": [
      { ingredient: "Limão", qty: 0.09 },
      { ingredient: "Farinha", qty: 0.04 },
      { ingredient: "Ovos", qty: 1 },
    ],
    "Queijo de ovelha da serra": [{ ingredient: "Queijo de ovelha", qty: 0.12 }],
    "Gin tónica da casa": [{ ingredient: "Gin", qty: 0.05 }],
    "Vinho tinto Douro": [{ ingredient: "Vinho tinto Douro", qty: 0.15 }],
    "Água com gás 0,75 L": [{ ingredient: "Água mineral", qty: 1 }],
  };
  const insertRecipe = db.prepare("INSERT INTO product_ingredients (product_id,ingredient_id,qty) VALUES (?,?,?)");
  for (const [product, list] of Object.entries(recipes)) {
    for (const line of list) {
      insertRecipe.run(productIds[product], ingredientIds[line.ingredient], line.qty);
    }
  }

  // ---- Customers & reservations --------------------------------------------
  const insertCustomer = db.prepare(
    "INSERT INTO customers (restaurant_id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,?)",
  );
  const customers = [
    { name: "Inês Carvalho", email: "ines.carvalho@example.pt", phone: "+351 912 345 678", notes: "Prefere mesa junto à janela." },
    { name: "Miguel Santos", email: "miguel.santos@example.pt", phone: "+351 913 887 221", notes: "Alergia a frutos de casca rija." },
    { name: "Beatriz Rocha", email: "beatriz.rocha@example.pt", phone: "+351 934 552 108", notes: "" },
    { name: "Tiago Fernandes", email: "tiago.fernandes@example.pt", phone: "+351 926 774 310", notes: "Cliente habitual, vinho tinto." },
    { name: "Sara Pinto", email: "sara.pinto@example.pt", phone: "+351 915 220 904", notes: "Aniversário em outubro." },
    { name: "João Mendes", email: "joao.mendes@example.pt", phone: "+351 966 118 442", notes: "" },
    { name: "Marta Sousa", email: "marta.sousa@example.pt", phone: "+351 917 903 556", notes: "Mesa vegetariana." },
    { name: "André Filipe", email: "andre.filipe@example.pt", phone: "+351 932 447 118", notes: "" },
    { name: "Clara Antunes", email: "clara.antunes@example.pt", phone: "+351 962 330 775", notes: "Cadeira para bebé." },
    { name: "Pedro Nogueira", email: "pedro.nogueira@example.pt", phone: "+351 919 556 203", notes: "" },
  ];
  const customerIds: number[] = [];
  for (const c of customers) {
    const res = insertCustomer.run(restaurantId, c.name, c.email, c.phone, c.notes, ago(60 * 24 * 45));
    customerIds.push(Number(res.lastInsertRowid));
  }

  const insertReservation = db.prepare(`
    INSERT INTO reservations (restaurant_id,code,customer_id,table_id,date,time,party_size,status,note,source,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const reservationDefs: {
    code: string;
    customer: number;
    table: string | null;
    date: string;
    time: string;
    party: number;
    status: string;
    note: string;
    source: string;
  }[] = [
    { code: "RSV-2401", customer: 0, table: "T05", date: today, time: "20:00", party: 2, status: "confirmed", note: "Mesa junto à janela.", source: "website" },
    { code: "RSV-2402", customer: 1, table: "T09", date: today, time: "20:30", party: 4, status: "confirmed", note: "Alergia a frutos de casca rija.", source: "website" },
    { code: "RSV-2403", customer: 2, table: "T12", date: today, time: "21:00", party: 3, status: "pending", note: "", source: "website" },
    { code: "RSV-2404", customer: 3, table: "T02", date: today, time: "21:30", party: 2, status: "confirmed", note: "Cliente habitual.", source: "phone" },
    { code: "RSV-2405", customer: 4, table: "T03", date: today, time: "19:15", party: 2, status: "seated", note: "Aniversário — sobremesa com vela.", source: "website" },
    { code: "RSV-2406", customer: 5, table: "T06", date: localDate(1), time: "19:30", party: 4, status: "confirmed", note: "", source: "website" },
    { code: "RSV-2407", customer: 6, table: "T14", date: localDate(1), time: "20:00", party: 6, status: "confirmed", note: "Menu vegetariano para 2 pessoas.", source: "website" },
    { code: "RSV-2408", customer: 7, table: "T18", date: localDate(1), time: "20:30", party: 4, status: "pending", note: "", source: "website" },
    { code: "RSV-2409", customer: 8, table: "T10", date: localDate(1), time: "13:00", party: 2, status: "confirmed", note: "Cadeira para bebé.", source: "phone" },
    { code: "RSV-2410", customer: 9, table: "T07", date: localDate(2), time: "19:30", party: 6, status: "confirmed", note: "Jantar de empresa.", source: "admin" },
    { code: "RSV-2411", customer: 2, table: "T16", date: localDate(2), time: "20:00", party: 2, status: "confirmed", note: "", source: "website" },
    { code: "RSV-2412", customer: 4, table: "T19", date: localDate(3), time: "21:00", party: 4, status: "pending", note: "", source: "website" },
  ];
  for (const r of reservationDefs) {
    insertReservation.run(
      restaurantId,
      r.code,
      customerIds[r.customer],
      r.table ? tableIds[r.table] : null,
      r.date,
      r.time,
      r.party,
      r.status,
      r.note,
      r.source,
      ago(60 * 40),
      ago(60 * 5),
    );
  }

  // ---- Orders ---------------------------------------------------------------
  const insertOrder = db.prepare(`
    INSERT INTO orders (restaurant_id,table_id,number,status,payment_status,guests,waiter_id,notes,subtotal_cents,
      discount_cents,tax_cents,net_sales_cents,service_cents,total_cents,paid_cents,opened_at,closed_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id,product_id,name,unit_price_cents,qty,notes,status,modifiers_json,course,stock_deducted,
      created_at,sent_at,started_at,ready_at,served_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertOrderEvent = db.prepare(
    "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
  );
  const insertKitchenEvent = db.prepare(`
    INSERT INTO kitchen_events (restaurant_id,order_id,order_item_id,from_status,to_status,actor_id,created_at)
    VALUES (?,?,?,?,?,?,?)`);
  const insertPayment = db.prepare(`
    INSERT INTO payments (restaurant_id,order_id,amount_cents,method,status,reference,actor_id,confirmed_at,confirmed_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const updateIngredientStock = db.prepare("UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?");
  const stockRecipes = db.prepare(`
    SELECT pi.product_id, pi.ingredient_id, pi.qty, i.name, i.unit
    FROM product_ingredients pi JOIN ingredients i ON i.id = pi.ingredient_id
    WHERE pi.product_id = ?`);

  function createOrder(order: SeedOrder) {
    const tableId = tableIds[order.tableCode];
    const lines = order.items
      .filter((i) => i.status !== "void")
      .map((i) => {
        const modifierList = (i.modifiers ?? []).map((m) => modifierByKey[m]).filter(Boolean);
        const unit = productPrice[i.name] + modifierList.reduce((s, m) => s + m.priceDeltaCents, 0);
        return { unit, qty: i.qty, modifiers: modifierList, item: i };
      });
    const totals = computeOrderTotals(
      { lines: lines.map((l) => ({ unitPriceCents: l.unit, qty: l.qty })), discountCents: order.discountCents ?? 0 },
      { taxRateBps: 2300, pricesIncludeTax: true, serviceChargeBps: 0 },
    );
    const resolvedPayments = (order.payments ?? []).map((p) => ({
      ...p,
      amountCents: p.amountCents === -1 ? totals.totalCents : p.amountCents,
    }));
    const paidCents = resolvedPayments.reduce((s, p) => s + p.amountCents, 0);
    const res = insertOrder.run(
      restaurantId,
      tableId,
      order.number,
      order.status,
      order.paymentStatus,
      order.guests,
      order.waiterId,
      order.notes ?? "",
      totals.subtotalCents,
      totals.discountCents,
      totals.taxCents,
      totals.netSalesCents,
      totals.serviceCents,
      totals.totalCents,
      paidCents,
      order.openedAt,
      order.closedAt ?? null,
      order.closedAt ?? order.openedAt,
    );
    const orderId = Number(res.lastInsertRowid);
    insertOrderEvent.run(orderId, restaurantId, "opened", `Mesa ${order.tableCode} aberta com ${order.guests} pax`, order.waiterId, order.openedAt);

    for (const line of lines) {
      const { item } = line;
      const created = item.minutesAgo != null ? ago(item.minutesAgo + 2) : order.openedAt;
      const sent = ["sent", "preparing", "ready", "served"].includes(item.status)
        ? item.minutesAgo != null
          ? ago(item.minutesAgo)
          : order.openedAt
        : null;
      const started = ["preparing", "ready", "served"].includes(item.status)
        ? item.minutesAgo != null
          ? ago(Math.max(0, item.minutesAgo - 3))
          : order.openedAt
        : null;
      const ready = ["ready", "served"].includes(item.status)
        ? item.minutesAgo != null
          ? ago(Math.max(0, item.minutesAgo - 8))
          : order.openedAt
        : null;
      const served = item.status === "served" ? ready : null;
      const itemRes = insertOrderItem.run(
        orderId,
        productIds[item.name],
        item.name,
        productPrice[item.name],
        item.qty,
        item.notes ?? "",
        item.status,
        JSON.stringify(line.modifiers),
        item.course ?? "main",
        0,
        created,
        sent,
        started,
        ready,
        served,
      );
      const itemId = Number(itemRes.lastInsertRowid);
      if (sent) insertKitchenEvent.run(restaurantId, orderId, itemId, "draft", "sent", order.waiterId, sent);
      if (started) insertKitchenEvent.run(restaurantId, orderId, itemId, "sent", "preparing", chefSofia, started);
      if (ready) insertKitchenEvent.run(restaurantId, orderId, itemId, "preparing", "ready", chefSofia, ready);
      if (served) insertKitchenEvent.run(restaurantId, orderId, itemId, "ready", "served", order.waiterId, ready);

      if (sent && item.status !== "draft") {
        const recipe = stockRecipes.all(productIds[item.name]) as { ingredient_id: number; qty: number; name: string; unit: string }[];
        for (const line2 of recipe) {
          const delta = -(line2.qty * item.qty);
          updateIngredientStock.run(line2.qty * item.qty, line2.ingredient_id);
          insertMovement.run(
            restaurantId,
            line2.ingredient_id,
            delta,
            `Consumo — comanda #${order.number}`,
            orderId,
            chefSofia,
            sent,
          );
          ingredientStock[line2.name] = (ingredientStock[line2.name] ?? 0) + delta;
        }
        db.prepare("UPDATE order_items SET stock_deducted = 1 WHERE id = ?").run(itemId);
      }
    }

    const sentAny = order.items.some((i) => i.status !== "draft" && i.status !== "void");
    if (sentAny) {
      insertOrderEvent.run(
        orderId,
        restaurantId,
        "sent",
        `${lines.length} linha(s) enviadas para a cozinha`,
        order.waiterId,
        order.openedAt,
      );
    }

    for (const payment of resolvedPayments) {
      insertPayment.run(
        restaurantId,
        orderId,
        payment.amountCents,
        payment.method,
        payment.status,
        payment.reference ?? null,
        order.waiterId,
        payment.status === "confirmed" ? payment.at : null,
        payment.status === "confirmed" ? managerAna : null,
        payment.at,
      );
      insertOrderEvent.run(
        orderId,
        restaurantId,
        payment.status === "confirmed" ? "payment_confirmed" : "payment_recorded",
        `Pagamento ${payment.status === "confirmed" ? "confirmado" : "registado"} por ${order.waiterId === waiterRui ? "Rui Almeida" : "Diogo Marques"}`,
        order.waiterId,
        payment.at,
      );
    }

    if (order.status === "paid" && order.closedAt) {
      insertOrderEvent.run(orderId, restaurantId, "closed", "Conta fechada e mesa libertada", managerAna, order.closedAt);
    }
    return { orderId, totals };
  }

  // Historic paid orders (today's lunch, yesterday, two days ago).
  const historic: SeedOrder[] = [
    {
      number: 1001,
      tableCode: "T04",
      guests: 2,
      waiterId: waiterDiogo,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atToday("12:24"),
      closedAt: atToday("13:42"),
      items: [
        { name: "Crudo de robalo", qty: 1, status: "served", course: "starter" },
        { name: "Robalo selvagem", qty: 1, status: "served" },
        { name: "Picanha maturada 45 dias", qty: 1, status: "served" },
        { name: "Vinho tinto Douro", qty: 2, status: "served", course: "drink" },
        { name: "Espresso", qty: 2, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "card", status: "confirmed", at: atToday("13:41"), reference: "TRX-7741" }],
    },
    {
      number: 1002,
      tableCode: "T10",
      guests: 2,
      waiterId: waiterRui,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atToday("12:40"),
      closedAt: atToday("13:55"),
      discountCents: 300,
      items: [
        { name: "Burrata fumada", qty: 1, status: "served", course: "starter" },
        { name: "Risotto de açafrão", qty: 1, status: "served" },
        { name: "Cogumelos silvestres", qty: 1, status: "served" },
        { name: "Chocolate 70%", qty: 1, status: "served", course: "dessert" },
        { name: "Água com gás 0,75 L", qty: 1, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "mbway", status: "confirmed", at: atToday("13:54"), reference: "MB-22906" }],
    },
    {
      number: 1003,
      tableCode: "T05",
      guests: 4,
      waiterId: waiterDiogo,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atToday("12:55"),
      closedAt: atToday("14:38"),
      items: [
        { name: "Pão de fermentação lenta", qty: 2, status: "served", course: "starter" },
        { name: "Costeleta de novilho", qty: 1, status: "served" },
        { name: "Polvo à brasa", qty: 2, status: "served" },
        { name: "Legumes à brasa", qty: 1, status: "served" },
        { name: "Vinho tinto Douro", qty: 4, status: "served", course: "drink" },
        { name: "Pastel de nata caramelizado", qty: 4, status: "served", course: "dessert" },
      ],
      payments: [{ amountCents: -1, method: "cash", status: "confirmed", at: atToday("14:37") }],
    },
    {
      number: 1004,
      tableCode: "T16",
      guests: 1,
      waiterId: waiterRui,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atToday("13:10"),
      closedAt: atToday("14:05"),
      items: [
        { name: "Tartar de novilho", qty: 1, status: "served", course: "starter" },
        { name: "Legumes à brasa", qty: 1, status: "served" },
        { name: "Espresso", qty: 1, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "card", status: "confirmed", at: atToday("14:04"), reference: "TRX-7749" }],
    },
    {
      number: 1005,
      tableCode: "T12",
      guests: 5,
      waiterId: waiterDiogo,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-1, "19:45"),
      closedAt: atDay(-1, "21:50"),
      items: [
        { name: "Crudo de robalo", qty: 2, status: "served", course: "starter" },
        { name: "Picanha maturada 45 dias", qty: 2, status: "served" },
        { name: "Robalo selvagem", qty: 1, status: "served" },
        { name: "Tarte de limão e merengue", qty: 2, status: "served", course: "dessert" },
        { name: "Gin tónica da casa", qty: 4, status: "served", course: "drink" },
        { name: "Vinho tinto Douro", qty: 1, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "card", status: "confirmed", at: atDay(-1, "21:49"), reference: "TRX-7688" }],
    },
    {
      number: 1006,
      tableCode: "T09",
      guests: 2,
      waiterId: waiterRui,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-1, "20:10"),
      closedAt: atDay(-1, "21:35"),
      items: [
        { name: "Burrata fumada", qty: 1, status: "served", course: "starter" },
        { name: "Pato assado", qty: 1, status: "served" },
        { name: "Risotto de açafrão", qty: 1, status: "served" },
        { name: "Chocolate 70%", qty: 2, status: "served", course: "dessert" },
        { name: "Vinho tinto Douro", qty: 3, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "mbway", status: "confirmed", at: atDay(-1, "21:34"), reference: "MB-22877" }],
    },
    {
      number: 1007,
      tableCode: "T18",
      guests: 4,
      waiterId: waiterDiogo,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-1, "20:25"),
      closedAt: atDay(-1, "22:15"),
      items: [
        { name: "Pão de fermentação lenta", qty: 1, status: "served", course: "starter" },
        { name: "Polvo à brasa", qty: 2, status: "served" },
        { name: "Picanha maturada 45 dias", qty: 2, status: "served" },
        { name: "Água com gás 0,75 L", qty: 2, status: "served", course: "drink" },
        { name: "Vinho tinto Douro", qty: 4, status: "served", course: "drink" },
        { name: "Pastel de nata caramelizado", qty: 4, status: "served", course: "dessert" },
      ],
      payments: [{ amountCents: -1, method: "card", status: "confirmed", at: atDay(-1, "22:14"), reference: "TRX-7691" }],
    },
    {
      number: 1008,
      tableCode: "T06",
      guests: 3,
      waiterId: waiterRui,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-1, "12:30"),
      closedAt: atDay(-1, "13:48"),
      items: [
        { name: "Tartar de novilho", qty: 1, status: "served", course: "starter" },
        { name: "Robalo selvagem", qty: 2, status: "served" },
        { name: "Legumes à brasa", qty: 1, status: "served" },
        { name: "Espresso", qty: 3, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "card", status: "confirmed", at: atDay(-1, "13:47"), reference: "TRX-7679" }],
    },
    {
      number: 1009,
      tableCode: "T14",
      guests: 7,
      waiterId: waiterDiogo,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-2, "19:30"),
      closedAt: atDay(-2, "22:20"),
      discountCents: 1500,
      items: [
        { name: "Crudo de robalo", qty: 3, status: "served", course: "starter" },
        { name: "Costeleta de novilho", qty: 2, status: "served" },
        { name: "Risotto de açafrão", qty: 2, status: "served" },
        { name: "Gin tónica da casa", qty: 6, status: "served", course: "drink" },
        { name: "Tarte de limão e merengue", qty: 3, status: "served", course: "dessert" },
      ],
      payments: [{ amountCents: -1, method: "transfer", status: "confirmed", at: atDay(-2, "22:18"), reference: "INV-2026-041" }],
    },
    {
      number: 1010,
      tableCode: "T11",
      guests: 2,
      waiterId: waiterRui,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-2, "20:00"),
      closedAt: atDay(-2, "21:20"),
      items: [
        { name: "Cogumelos silvestres", qty: 1, status: "served" },
        { name: "Pato assado", qty: 1, status: "served" },
        { name: "Queijo de ovelha da serra", qty: 1, status: "served", course: "dessert" },
        { name: "Vinho tinto Douro", qty: 2, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "card", status: "confirmed", at: atDay(-2, "21:19"), reference: "TRX-7601" }],
    },
    {
      number: 1011,
      tableCode: "T02",
      guests: 2,
      waiterId: waiterDiogo,
      status: "paid",
      paymentStatus: "confirmed",
      openedAt: atDay(-2, "12:35"),
      closedAt: atDay(-2, "13:40"),
      items: [
        { name: "Pão de fermentação lenta", qty: 1, status: "served", course: "starter" },
        { name: "Robalo selvagem", qty: 1, status: "served" },
        { name: "Chocolate 70%", qty: 1, status: "served", course: "dessert" },
        { name: "Água com gás 0,75 L", qty: 1, status: "served", course: "drink" },
      ],
      payments: [{ amountCents: -1, method: "cash", status: "confirmed", at: atDay(-2, "13:39") }],
    },
    {
      number: 1012,
      tableCode: "T15",
      guests: 2,
      waiterId: waiterRui,
      status: "cancelled",
      paymentStatus: "unpaid",
      openedAt: atToday("12:05"),
      closedAt: atToday("12:18"),
      notes: "Cliente saiu antes de enviar o pedido.",
      items: [
        { name: "Vinho tinto Douro", qty: 1, status: "void", course: "drink" },
      ],
    },
  ];
  for (const order of historic) createOrder(order);

  // Active service (relative timestamps so timers are live).
  const active: SeedOrder[] = [
    {
      number: 1041,
      tableCode: "T03",
      guests: 2,
      waiterId: waiterDiogo,
      status: "served",
      paymentStatus: "unpaid",
      openedAt: ago(58),
      items: [
        { name: "Gin tónica da casa", qty: 2, status: "served", course: "drink", minutesAgo: 52 },
        { name: "Chocolate 70%", qty: 2, status: "served", course: "dessert", minutesAgo: 18 },
      ],
    },
    {
      number: 1042,
      tableCode: "T07",
      guests: 4,
      waiterId: waiterRui,
      status: "sent",
      paymentStatus: "unpaid",
      openedAt: ago(46),
      notes: "Aniversariante — sobremesa com vela no final.",
      items: [
        { name: "Robalo selvagem", qty: 1, status: "sent", minutesAgo: 33, notes: "Sem molho de manteiga" },
        { name: "Picanha maturada 45 dias", qty: 2, status: "preparing", minutesAgo: 33, modifiers: ["Mal passado"] },
        { name: "Pão de fermentação lenta", qty: 1, status: "ready", minutesAgo: 33, course: "starter" },
        { name: "Vinho tinto Douro", qty: 2, status: "served", minutesAgo: 30, course: "drink" },
      ],
    },
    {
      number: 1043,
      tableCode: "T08",
      guests: 2,
      waiterId: waiterDiogo,
      status: "awaiting_payment",
      paymentStatus: "recorded",
      openedAt: ago(74),
      items: [
        { name: "Burrata fumada", qty: 1, status: "served", course: "starter", minutesAgo: 66 },
        { name: "Polvo à brasa", qty: 1, status: "served", minutesAgo: 60 },
        { name: "Picanha maturada 45 dias", qty: 1, status: "served", minutesAgo: 60 },
        { name: "Tarte de limão e merengue", qty: 2, status: "served", course: "dessert", minutesAgo: 22 },
      ],
      payments: [
        { amountCents: -1, method: "card", status: "recorded", at: ago(6), reference: "TRX-PENDING-8817" },
      ],
    },
    {
      number: 1044,
      tableCode: "T11",
      guests: 2,
      waiterId: waiterRui,
      status: "served",
      paymentStatus: "unpaid",
      openedAt: ago(20),
      items: [
        { name: "Água com gás 0,75 L", qty: 2, status: "served", course: "drink", minutesAgo: 14 },
        { name: "Gin tónica da casa", qty: 2, status: "ready", course: "drink", minutesAgo: 9 },
      ],
    },
    {
      number: 1045,
      tableCode: "T14",
      guests: 6,
      waiterId: waiterDiogo,
      status: "partially_ready",
      paymentStatus: "unpaid",
      openedAt: ago(31),
      items: [
        { name: "Costeleta de novilho", qty: 2, status: "preparing", minutesAgo: 24, notes: "Uma bem passada, uma mal passada" },
        { name: "Polvo à brasa", qty: 2, status: "ready", minutesAgo: 24 },
        { name: "Legumes à brasa", qty: 2, status: "preparing", minutesAgo: 24 },
        { name: "Vinho tinto Douro", qty: 3, status: "served", course: "drink", minutesAgo: 27 },
      ],
    },
  ];
  for (const order of active) createOrder(order);

  // Audit trail seed (so the log is never empty on first boot).
  const insertAudit = db.prepare(
    "INSERT INTO audit_log (restaurant_id,actor_id,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)",
  );
  insertAudit.run(restaurantId, managerAna, "payment.confirm", "payment", "1", "Pagamento TRX-7688 confirmado (€208,40)", atDay(-1, "21:50"));
  insertAudit.run(restaurantId, waiterDiogo, "order.open", "order", "1042", "Comanda #1042 aberta para T07", ago(46));
  insertAudit.run(restaurantId, chefSofia, "order_item.ready", "order_item", "1042", "Pão de fermentação lenta marcado como pronto", ago(25));
  insertAudit.run(restaurantId, managerAna, "reservation.assign", "reservation", "RSV-2402", "Mesa T09 atribuída a Inês Carvalho", ago(60 * 5));

  db.exec("PRAGMA optimize;");
}
