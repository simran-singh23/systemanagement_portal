import { z } from "zod";

export const globalSearchSchema = z.object({ q: z.string().trim().min(2).max(100) });

export const pageSizes = [10, 20, 50] as const;
export type PageSize = typeof pageSizes[number];

export function parsePagination(input: { page?: string; pageSize?: string }) {
  const page = Math.max(1, Math.min(100_000, Number.parseInt(input.page ?? "1", 10) || 1));
  const requested = Number.parseInt(input.pageSize ?? "20", 10);
  const pageSize = pageSizes.includes(requested as PageSize) ? requested as PageSize : 20;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function boundedPage(page: number, total: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(page, pages), pages };
}

export function allowedValue<T extends string>(value: string | undefined, allowed: readonly T[]) {
  return allowed.includes(value as T) ? value as T : undefined;
}

export function safeQuery(value: string | undefined) {
  return (value ?? "").trim().slice(0, 100);
}
