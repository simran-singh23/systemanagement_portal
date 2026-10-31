export type SearchCategory = "employees" | "tasks" | "reports" | "attendance" | "leave";

export type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  description: string;
  href: string;
};

export type GlobalSearchResponse = {
  query: string;
  groups: { category: SearchCategory; label: string; results: SearchResult[] }[];
};
