/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations-postgresql",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/neurorobi?schema=public",
  },
});
