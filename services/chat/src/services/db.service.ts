import { PrismaClient } from "../generated/prisma/index.js";

export const db = new PrismaClient({
  log: ["warn", "error"],
});

export async function closeDb() {
  await db.$disconnect();
}
