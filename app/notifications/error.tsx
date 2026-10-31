"use client";
import { ErrorState } from "@/components/ui/error-state";
export default function NotificationsError({ reset }: { reset: () => void }) { return <ErrorState title="Notifications could not load" description="Refresh the inbox and try again." reset={reset} />; }
