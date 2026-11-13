"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function EmployeeWorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="This workspace page didn’t load" description="Your account is still signed in. Try loading the page again." reset={reset} />;
}
