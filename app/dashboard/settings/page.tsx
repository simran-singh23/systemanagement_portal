import type { Metadata } from "next";
import { SettingsDashboard } from "@/components/settings/settings-dashboard";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { ORGANIZATION_SETTINGS_DEFAULTS } from "@/lib/organization-settings";
import { prisma } from "@/lib/prisma";
import { emailSenderConfigured } from "@/lib/email/delivery";
import { reportRecipientWhere } from "@/lib/email/recipients";

export const metadata: Metadata = { title: "Organization Settings" };
export const dynamic = "force-dynamic";

const sectionIds = ["general", "office", "working-days", "holidays", "attendance", "breaks", "leave", "reports", "automation", "email", "ai"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [{ organization }, filters] = await Promise.all([requireCurrentOrganization("organization:manage"), searchParams]);
  const initialSection = sectionIds.includes(filters.section as typeof sectionIds[number]) ? filters.section as typeof sectionIds[number] : "general";
  const timezones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Asia/Kolkata", "UTC", "Europe/London", "America/New_York"];
  const [settings, holidays, recipients] = await Promise.all([
    prisma.organizationSettings.findUnique({ where: { organizationId: organization.id } }),
    prisma.organizationHoliday.findMany({ where: { organizationId: organization.id }, orderBy: { holidayDate: "asc" } }),
    prisma.user.findMany({
      where: reportRecipientWhere(organization.id),
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <SettingsDashboard
    organization={{ id: organization.id, name: organization.name, logoUrl: organization.logoUrl, contactEmail: organization.contactEmail, contactPhone: organization.contactPhone, description: organization.description }}
    settings={{ ...ORGANIZATION_SETTINGS_DEFAULTS, ...settings }}
    holidays={holidays.map((holiday) => ({ id: holiday.id, date: holiday.holidayDate.toISOString().slice(0, 10), name: holiday.name, description: holiday.description }))}
    recipients={recipients}
    emailDeliveryAvailable={emailSenderConfigured() && Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()) && (process.env.NODE_ENV === "production" || Boolean(process.env.RESEND_TEST_RECIPIENTS?.trim()))}
    aiProviderAvailable={Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim())}
    initialSection={initialSection}
    timezones={timezones}
  />;
}
