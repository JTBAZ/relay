import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/** Prisma CLI + Migrate: connection URL lives here (Prisma 7+). Root `.env.example` documents DATABASE_URL. */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
