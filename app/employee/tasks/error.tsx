"use client";
import { ErrorState } from "@/components/ui/error-state";

export default function MyTasksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Your tasks could not be loaded" description="Refresh the task queue after the connection is restored." reset={reset} />;
}
