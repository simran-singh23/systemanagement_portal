import { loadEnvConfig } from "@next/env";

// CLI tools must resolve .env files in the same order as the Next.js app.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
