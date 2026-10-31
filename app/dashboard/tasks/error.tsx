"use client";
import { ErrorState } from "@/components/ui/error-state";

export default function TasksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Tasks could not be loaded" description="Check the connection, then try again." reset={reset} />;
}
