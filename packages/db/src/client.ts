import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://talestudio:talestudio@localhost:5432/talestudio";

const globalForDb = globalThis as unknown as { __tsSql?: postgres.Sql };
// Reuse the pool across Next.js hot reloads.
const sqlClient = globalForDb.__tsSql ?? postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__tsSql = sqlClient;

export const db = drizzle(sqlClient, { schema, casing: "snake_case" });
export type Db = typeof db;
