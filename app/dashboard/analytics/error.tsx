"use client";
import { ErrorState } from "@/components/ui/error-state";
export default function AnalyticsError({ reset }: { reset: () => void }) { return <ErrorState title="Analytics could not load" description="Check the selected date range and try again." reset={reset} />; }
