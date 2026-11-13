"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="This workspace page didn’t load" description="Your session is still active. Try loading the page again." reset={reset} />;
}
