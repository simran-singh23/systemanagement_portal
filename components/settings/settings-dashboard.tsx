"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { BreakType, LeaveType, UserRole } from "@prisma/client";
import {
  BellRing, BrainCircuit, Building2, CalendarDays, ChevronRight, Clock3, Coffee,
  FileText, Mail, Save, Settings2, ShieldCheck, Sparkles, UsersRound,
} from "lucide-react";
import {
  createHoliday, deleteHoliday, updateHoliday, updateOrganizationSettings,
  type SettingsActionState,
} from "@/actions/settings.actions";
import { ALL_BREAK_TYPES, ALL_LEAVE_TYPES, WEEK_DAYS } from "@/lib/organization-settings";

type Settings = {
  timezone: string; workdayStart: string; workdayEnd: string; workDays: number[]; lateGraceMins: number;
  expectedDailyMinutes: number; overnightShiftEnabled: boolean; halfDayThresholdMins: number;
  autoFinalizeAbsence: boolean; absenceFinalizationTime: string; allowAttendanceCorrections: boolean;
  requireCorrectionApproval: boolean; lunchReminderTime: string; suggestedLunchMins: number;
  allowedBreakTypes: BreakType[]; maxBreakMins: number | null; checkInReminderTime: string;
  checkInCutoffTime: string; dailyReportReminderTime: string; dailyReportDueTime: string;
  managerSummaryTime: string; taskDeadlineReminderHours: number[]; requireDailyReports: boolean;
  allowEmployeeTaskEdit: boolean; allowReportBeforeCheckout: boolean; allowOverlappingLeaveRequests: boolean;
  availableLeaveTypes: LeaveType[]; requireLeaveApproval: boolean; leaveAdvanceNoticeDays: number;
  allowPastDateLeaveRequests: boolean; allowReportEditingAfterSubmission: boolean;
  enableCheckInReminders: boolean; enableMissingCheckInAlerts: boolean; notifyManagersMissingCheckIn: boolean;
  enableLunchReminders: boolean; enableTaskDeadlineReminders: boolean; notifyManagersOverdueTasks: boolean;
  enableDailyReportReminders: boolean; enableMissingReportAlerts: boolean; notifyManagersMissingReports: boolean;
  enableDailyTeamSummary: boolean; dailyEmailEnabled: boolean; dailyEmailTime: string;
  primaryReportRecipientId: string | null; additionalReportRecipientIds: string[];
  aiEnabled: boolean; aiSummaryEnabled: boolean; aiAssistantEnabled: boolean;
  aiAuthorizedRoles: UserRole[]; aiProvider: "OPENAI"; aiMonthlyRequestLimit: number;
  aiMonthlyTokenLimit: number; aiContextMaxChars: number; aiRetentionDays: number;
};

type Props = {
  organization: { id: string; name: string; logoUrl: string | null; contactEmail: string | null; contactPhone: string | null; description: string | null };
  settings: Settings;
  holidays: { id: string; date: string; name: string; description: string | null }[];
  recipients: { id: string; name: string | null; email: string; role: string }[];
  emailDeliveryAvailable: boolean;
  aiProviderAvailable: boolean;
  initialSection: SectionId;
  timezones: string[];
};

const sections = [
  ["general", "General", Building2], ["office", "Office timings", Clock3], ["working-days", "Working days", CalendarDays],
  ["holidays", "Holidays", Sparkles], ["attendance", "Attendance", ShieldCheck], ["breaks", "Break policies", Coffee],
  ["leave", "Leave policies", UsersRound], ["reports", "Daily reports", FileText], ["automation", "Notifications", BellRing],
  ["email", "Email reports", Mail], ["ai", "AI insights", BrainCircuit],
] as const;
type SectionId = typeof sections[number][0];
const initialState: SettingsActionState = {};
const control = "mt-1.5 h-11 w-full rounded-xl border border-[#d9e0ea] bg-white px-3 text-sm text-[#253047] outline-none transition placeholder:text-[#a5adba] focus:border-[#6d96eb] focus:ring-4 focus:ring-[#e8f0ff]";
const textArea = `${control} h-auto min-h-28 py-3`;

export function SettingsDashboard({ organization, settings, holidays, recipients, emailDeliveryAvailable, aiProviderAvailable, initialSection, timezones }: Props) {
  const [active, setActive] = useState<SectionId>(initialSection);
  const [dirty, setDirty] = useState(false);
  const [state, action] = useActionState(updateOrganizationSettings, initialState);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choose(id: SectionId) {
    if (dirty && id === "holidays" && !window.confirm("You have unsaved policy changes. Continue without saving?")) return;
    setActive(id);
    window.history.replaceState(null, "", `?section=${id}`);
  }

  return <div className="space-y-6 pb-24">
    <header className="relative overflow-hidden rounded-[1.5rem] border border-[#dce4ef] bg-white px-5 py-6 sm:px-7">
      <div className="absolute right-0 top-0 h-full w-48 bg-[radial-gradient(circle_at_top_right,#dfeaff,transparent_68%)]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2563eb]">Workspace control</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Organization settings</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">Configure office schedules and operational policies for {organization.name}. Changes apply prospectively and never rewrite historical records.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dce6f7] bg-[#f6f9ff] px-3 py-2 text-xs font-medium text-[#365b9d]"><ShieldCheck className="size-4" /> Admin controlled</div>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto rounded-2xl border border-[#e1e6ed] bg-white p-2 lg:block lg:space-y-1 lg:overflow-visible">
          {sections.map(([id, label, SectionIcon]) => <button key={id} type="button" onClick={() => choose(id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition lg:w-full ${active === id ? "bg-[#eef4ff] text-[#1d55c6]" : "text-[#667085] hover:bg-[#f7f8fa] hover:text-[#253047]"}`}><SectionIcon className="size-[17px]" /><span>{label}</span><ChevronRight className={`ml-auto hidden size-4 lg:block ${active === id ? "opacity-100" : "opacity-0"}`} /></button>)}
        </nav>
        <div className="mt-3 hidden rounded-2xl bg-[#172033] p-4 text-white lg:block"><Settings2 className="size-5 text-[#8fb1ff]" /><p className="mt-4 text-sm font-semibold">Policy scope</p><p className="mt-1 text-xs leading-5 text-white/60">Attendance, leave, reports, analytics and automations share this configuration.</p></div>
      </aside>

      <main className="min-w-0">
        {active === "holidays" ? <HolidaySection organizationId={organization.id} holidays={holidays} timezone={settings.timezone} /> : null}
        <form action={action} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)} className={active === "holidays" ? "hidden" : "space-y-4"}>
          <input type="hidden" name="organizationId" value={organization.id} />
          <Panel visible={active === "general"} eyebrow="Organization profile" title="General information" description="The identity and primary contact details shown across TeamFlow.">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Organization name" error={state.errors?.name}><input className={control} name="name" defaultValue={organization.name} required /></Field><Field label="Timezone" hint="Valid IANA timezone"><select className={control} name="timezone" defaultValue={settings.timezone} required>{!timezones.includes(settings.timezone) ? <option value={settings.timezone}>{settings.timezone}</option> : null}{timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></Field><Field label="Contact email" error={state.errors?.contactEmail}><input className={control} type="email" name="contactEmail" defaultValue={organization.contactEmail ?? ""} placeholder="operations@company.com" /></Field><Field label="Contact phone"><input className={control} name="contactPhone" defaultValue={organization.contactPhone ?? ""} placeholder="+91 98765 43210" /></Field><Field label="Logo URL" hint="URL only; file storage is not configured"><input className={control} type="url" name="logoUrl" defaultValue={organization.logoUrl ?? ""} placeholder="https://…" /></Field></div>
            <Field label="Description"><textarea className={textArea} name="description" defaultValue={organization.description ?? ""} placeholder="A short description of your organization." /></Field>
          </Panel>

          <Panel visible={active === "office"} eyebrow="Schedule" title="Office timings" description="These times drive check-in status, workday windows and reporting analytics.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Field label="Office start"><input className={control} type="time" name="workdayStart" defaultValue={settings.workdayStart} /></Field><Field label="Office end"><input className={control} type="time" name="workdayEnd" defaultValue={settings.workdayEnd} /></Field><Field label="Grace period" hint="Minutes after office start"><input className={control} type="number" name="lateGraceMins" min="0" max="180" defaultValue={settings.lateGraceMins} /></Field><Field label="Missing check-in cutoff"><input className={control} type="time" name="checkInCutoffTime" defaultValue={settings.checkInCutoffTime} /></Field><Field label="Expected daily hours"><input className={control} type="number" name="expectedDailyMinutes" min="60" max="1440" step="30" defaultValue={settings.expectedDailyMinutes} /><span className="mt-1 block text-[11px] text-[#98a2b3]">Stored in minutes ({(settings.expectedDailyMinutes / 60).toFixed(1)} hours currently).</span></Field></div>
            <Toggle name="overnightShiftEnabled" label="Overnight shift" description="Allow office end to fall on the following calendar day." checked={settings.overnightShiftEnabled} />
          </Panel>

          <Panel visible={active === "working-days"} eyebrow="Business calendar" title="Working days" description="Selected days feed attendance expectations, leave day counts, reports and analytics.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{WEEK_DAYS.map((day) => <label key={day.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e1e6ed] p-3.5 hover:border-[#b9cae8]"><input type="checkbox" name="workDays" value={day.value} defaultChecked={settings.workDays.includes(day.value)} className="size-4 accent-[#2563eb]" /><span><span className="block text-sm font-semibold text-[#344054]">{day.label}</span><span className="text-xs text-[#98a2b3]">{settings.workDays.includes(day.value) ? "Current workday" : "Non-working day"}</span></span></label>)}</div>
            <ImpactNote>Changing working days affects future leave calculations, attendance expectations and report reminders. Existing attendance and leave records remain unchanged.</ImpactNote>
          </Panel>

          <Panel visible={active === "attendance"} eyebrow="Presence rules" title="Attendance policies" description="Late and half-day thresholds are evaluated in the organization timezone.">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Half-day threshold" hint="Minutes worked before HALF_DAY applies"><input className={control} type="number" name="halfDayThresholdMins" min="30" max="720" step="15" defaultValue={settings.halfDayThresholdMins} /></Field><Field label="Absence finalization time"><input className={control} type="time" name="absenceFinalizationTime" defaultValue={settings.absenceFinalizationTime} /></Field></div>
            <CapabilityNotice title="Correction workflow not enabled">Manual attendance correction and automatic absence finalization remain off until a reviewed correction workflow is implemented. The current setting is preserved and cannot be changed from this screen.</CapabilityNotice>
          </Panel>

          <Panel visible={active === "breaks"} eyebrow="Healthy pacing" title="Break policies" description="Control suggested duration, available break reasons and reminder behavior.">
            <div className="grid gap-4 sm:grid-cols-3"><Field label="Lunch reminder"><input className={control} type="time" name="lunchReminderTime" defaultValue={settings.lunchReminderTime} /></Field><Field label="Suggested lunch (minutes)"><input className={control} type="number" name="suggestedLunchMins" min="5" max="240" defaultValue={settings.suggestedLunchMins} /></Field><Field label="Maximum break (minutes)" hint="Blank means no hard maximum"><input className={control} type="number" name="maxBreakMins" min="5" max="480" defaultValue={settings.maxBreakMins ?? ""} /></Field></div>
            <OptionChecks name="allowedBreakTypes" title="Allowed break types" values={ALL_BREAK_TYPES} selected={settings.allowedBreakTypes} />
            <Toggle name="enableLunchReminders" label="Lunch reminders" description="Send a reminder at the configured lunch time on working days." checked={settings.enableLunchReminders} />
          </Panel>

          <Panel visible={active === "leave"} eyebrow="Time away" title="Leave policies" description="Define which request types employees can submit and the advance notice rules.">
            <OptionChecks name="availableLeaveTypes" title="Available leave types" values={ALL_LEAVE_TYPES} selected={settings.availableLeaveTypes} />
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Minimum advance notice (days)"><input className={control} type="number" name="leaveAdvanceNoticeDays" min="0" max="365" defaultValue={settings.leaveAdvanceNoticeDays} /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Toggle name="allowPastDateLeaveRequests" label="Past-date requests" description="Allow employees to submit leave starting before today." checked={settings.allowPastDateLeaveRequests} /><Toggle name="allowOverlappingLeaveRequests" label="Overlapping requests" description="Allow a user to submit overlapping pending or approved leave." checked={settings.allowOverlappingLeaveRequests} /></div>
            <CapabilityNotice title="Manager approval remains required">Automatic leave approval is not exposed because attendance projection and conflict review require an accountable manager decision.</CapabilityNotice>
          </Panel>

          <Panel visible={active === "reports"} eyebrow="Daily reporting" title="Daily report policies" description="Configure submission requirements and employee editing rules.">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Reminder time"><input className={control} type="time" name="dailyReportReminderTime" defaultValue={settings.dailyReportReminderTime} /></Field><Field label="Submission deadline"><input className={control} type="time" name="dailyReportDueTime" defaultValue={settings.dailyReportDueTime} /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Toggle name="requireDailyReports" label="Require daily reports" description="Expect a report on every configured working day." checked={settings.requireDailyReports} /><Toggle name="allowReportBeforeCheckout" label="Submit before checkout" description="Allow report submission while the office timer is still active." checked={settings.allowReportBeforeCheckout} /><Toggle name="allowReportEditingAfterSubmission" label="Edit after submission" description="Let employees revise submitted reports until manager review." checked={settings.allowReportEditingAfterSubmission} /><Toggle name="enableMissingReportAlerts" label="Missing-report escalation" description="Create alerts after the configured report deadline." checked={settings.enableMissingReportAlerts} /></div>
          </Panel>

          <Panel visible={active === "automation"} eyebrow="Automation controls" title="Notifications & automation" description="Schedule internal reminders using the organization timezone and working calendar.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Field label="Check-in reminder"><input className={control} type="time" name="checkInReminderTime" defaultValue={settings.checkInReminderTime} /></Field><Field label="Manager summary"><input className={control} type="time" name="managerSummaryTime" defaultValue={settings.managerSummaryTime} /></Field><Field label="Task reminder windows" hint="Comma-separated hours before deadline"><input className={control} name="taskDeadlineReminderHours" defaultValue={settings.taskDeadlineReminderHours.join(", ")} /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Toggle name="enableCheckInReminders" label="Check-in reminders" checked={settings.enableCheckInReminders} /><Toggle name="enableMissingCheckInAlerts" label="Missing check-in alerts" checked={settings.enableMissingCheckInAlerts} /><Toggle name="notifyManagersMissingCheckIn" label="Manager check-in alerts" checked={settings.notifyManagersMissingCheckIn} /><Toggle name="enableTaskDeadlineReminders" label="Task deadline reminders" checked={settings.enableTaskDeadlineReminders} /><Toggle name="notifyManagersOverdueTasks" label="Manager overdue alerts" checked={settings.notifyManagersOverdueTasks} /><Toggle name="enableDailyReportReminders" label="Daily report reminders" checked={settings.enableDailyReportReminders} /><Toggle name="notifyManagersMissingReports" label="Manager missing-report alerts" checked={settings.notifyManagersMissingReports} /><Toggle name="enableDailyTeamSummary" label="Daily team summary" checked={settings.enableDailyTeamSummary} /></div>
          </Panel>

          <Panel visible={active === "email"} eyebrow="Manager delivery" title="Email report settings" description="Choose verified manager recipients and the preferred daily delivery time.">
            <div className={`rounded-xl border p-4 ${emailDeliveryAvailable ? "border-[#bfe4d3] bg-[#f2fbf7]" : "border-[#f0d9aa] bg-[#fffaf0]"}`}><div className="flex gap-3"><Mail className={`mt-0.5 size-5 ${emailDeliveryAvailable ? "text-[#16825f]" : "text-[#a66b16]"}`} /><div><p className="text-sm font-semibold text-[#344054]">{emailDeliveryAvailable ? "Email sender configured" : "Email delivery unavailable"}</p><p className="mt-1 text-xs leading-5 text-[#667085]">{emailDeliveryAvailable ? "Daily report delivery uses verified recipients and the configured organization time." : "Configure the verified Resend sender, webhook secret and test recipient allowlist before enabling delivery."}</p></div></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Daily email time"><input className={control} type="time" name="dailyEmailTime" defaultValue={settings.dailyEmailTime} /></Field><Field label="Primary recipient"><select className={control} name="primaryReportRecipientId" defaultValue={settings.primaryReportRecipientId ?? ""}><option value="">Select verified manager</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name || recipient.email} · {recipient.role.replaceAll("_", " ")}</option>)}</select></Field></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7c8799]">Additional recipients</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{recipients.map((recipient) => <label key={recipient.id} className="flex items-center gap-3 rounded-xl border border-[#e1e6ed] p-3 text-sm text-[#344054]"><input type="checkbox" name="additionalReportRecipientIds" value={recipient.id} defaultChecked={settings.additionalReportRecipientIds.includes(recipient.id)} className="size-4 accent-[#2563eb]" /><span className="min-w-0"><span className="block truncate font-medium">{recipient.name || recipient.email}</span><span className="block truncate text-xs text-[#98a2b3]">{recipient.email}</span></span></label>)}</div></div>
            <Toggle name="dailyEmailEnabled" label="Enable daily email report" description="Only verified managers receive this organization's report." checked={settings.dailyEmailEnabled} disabled={!emailDeliveryAvailable} />
            <Link href="/dashboard/email-reports" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#2563eb]">View delivery history and preview →</Link>
          </Panel>

          <Panel visible={active === "ai"} eyebrow="Optional intelligence" title="AI insights & manager assistant" description="Enable bounded, read-only analysis of existing task and submitted report records. AI stays off by default.">
            <div className={`rounded-xl border p-4 ${aiProviderAvailable ? "border-[#bfe4d3] bg-[#f2fbf7]" : "border-[#f0d9aa] bg-[#fffaf0]"}`}>
              <div className="flex gap-3"><BrainCircuit className={`mt-0.5 size-5 ${aiProviderAvailable ? "text-[#16825f]" : "text-[#a66b16]"}`} /><div><p className="text-sm font-semibold text-[#344054]">{aiProviderAvailable ? "OpenAI provider configured" : "Provider configuration required"}</p><p className="mt-1 text-xs leading-5 text-[#667085]">{aiProviderAvailable ? "Requests use structured output and are sent with provider storage disabled." : "Set OPENAI_API_KEY and OPENAI_MODEL on the server before enabling this feature."}</p></div></div>
            </div>
            <Toggle name="aiEnabled" label="Enable AI insights" description="Master switch for this organization. No AI request is made while it is off." checked={settings.aiEnabled} disabled={!aiProviderAvailable} />
            <div className="grid gap-3 sm:grid-cols-2"><Toggle name="aiSummaryEnabled" label="Daily summaries & insights" description="Generate summaries, blocker signals and workload suggestions on demand." checked={settings.aiSummaryEnabled} disabled={!aiProviderAvailable} /><Toggle name="aiAssistantEnabled" label="Manager assistant" description="Allow authorized managers to ask bounded questions about current work records." checked={settings.aiAssistantEnabled} disabled={!aiProviderAvailable} /></div>
            <OptionChecks name="aiAuthorizedRoles" title="Authorized manager roles" values={["SUPER_ADMIN", "PRODUCT_MANAGER", "TEAM_LEAD"] as UserRole[]} selected={settings.aiAuthorizedRoles} />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Monthly requests"><input className={control} type="number" name="aiMonthlyRequestLimit" min="1" max="5000" defaultValue={settings.aiMonthlyRequestLimit} /></Field><Field label="Monthly tokens"><input className={control} type="number" name="aiMonthlyTokenLimit" min="1000" max="50000000" step="1000" defaultValue={settings.aiMonthlyTokenLimit} /></Field><Field label="Context limit" hint="Characters per request"><input className={control} type="number" name="aiContextMaxChars" min="4000" max="50000" step="1000" defaultValue={settings.aiContextMaxChars} /></Field><Field label="Retention" hint="Days before generated records expire"><input className={control} type="number" name="aiRetentionDays" min="1" max="90" defaultValue={settings.aiRetentionDays} /></Field></div>
            <ImpactNote>Only organization-scoped tasks and submitted daily reports are included. Employee names, email addresses, attendance duration, leave reasons and private notes are excluded. AI cannot change tasks, people, attendance or policy settings; every factual item must cite a TeamFlow source and remains subject to human review.</ImpactNote>
          </Panel>

          <input type="hidden" name="allowEmployeeTaskEdit" value={settings.allowEmployeeTaskEdit ? "on" : ""} />
          <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-[#cad6e7] bg-white/95 p-3 shadow-[0_18px_50px_rgba(36,50,75,0.16)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="text-sm font-semibold text-[#344054]">{dirty ? "Unsaved policy changes" : "Configuration synchronized"}</p><p className="truncate text-xs text-[#98a2b3]">{dirty ? "Save to apply these rules to future operations." : "Historical data remains unchanged."}</p></div><SaveButton />
          </div>
          {state.message ? <p role="status" className={`rounded-xl px-4 py-3 text-sm ${state.success ? "bg-[#eaf8f2] text-[#157357]" : "bg-[#fff1f0] text-[#a43b32]"}`}>{state.message}</p> : null}
        </form>
      </main>
    </div>
  </div>;
}

function Panel({ visible, eyebrow, title, description, children }: { visible: boolean; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className={`${visible ? "block" : "hidden"} rounded-[1.25rem] border border-[#e1e6ed] bg-white`}><div className="border-b border-[#edf0f4] px-5 py-5 sm:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#3d6fc5]">{eyebrow}</p><h2 className="mt-1.5 text-xl font-semibold tracking-[-0.025em] text-[#253047]">{title}</h2><p className="mt-1.5 text-sm leading-6 text-[#7c8799]">{description}</p></div><div className="space-y-5 p-5 sm:p-6">{children}</div></section>;
}
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string[]; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-[#5e6b7f]">{label}{children}{error?.[0] ? <span className="mt-1 block text-xs font-normal text-[#b5473c]">{error[0]}</span> : hint ? <span className="mt-1 block text-[11px] font-normal text-[#98a2b3]">{hint}</span> : null}</label>; }
function Toggle({ name, label, description, checked, disabled }: { name: string; label: string; description?: string; checked: boolean; disabled?: boolean }) { return <label className={`flex items-start gap-3 rounded-xl border border-[#e1e6ed] p-3.5 ${disabled ? "bg-[#f8f9fb] opacity-65" : "cursor-pointer hover:border-[#b9cae8]"}`}><input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="mt-0.5 size-4 accent-[#2563eb]" /><span><span className="block text-sm font-semibold text-[#344054]">{label}</span>{description ? <span className="mt-0.5 block text-xs leading-5 text-[#7c8799]">{description}</span> : null}</span></label>; }
function OptionChecks<T extends string>({ name, title, values, selected }: { name: string; title: string; values: T[]; selected: T[] }) { return <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7c8799]">{title}</p><div className="mt-2 flex flex-wrap gap-2">{values.map((value) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e1e6ed] px-3 py-2 text-xs font-medium text-[#344054] hover:border-[#b9cae8]"><input type="checkbox" name={name} value={value} defaultChecked={selected.includes(value)} className="size-4 accent-[#2563eb]" />{value.replaceAll("_", " ")}</label>)}</div></div>; }
function ImpactNote({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-[#cfdcf2] bg-[#f6f9ff] px-4 py-3 text-xs leading-5 text-[#49658f]">{children}</div>; }
function CapabilityNotice({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-xl border border-[#e2e6ec] bg-[#f8f9fb] p-4"><p className="text-sm font-semibold text-[#536074]">{title}</p><p className="mt-1 text-xs leading-5 text-[#7c8799]">{children}</p></div>; }
function SaveButton() { const { pending } = useFormStatus(); return <button disabled={pending} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#172033] px-5 text-sm font-semibold text-white transition hover:bg-[#253047] disabled:opacity-60"><Save className="size-4" />{pending ? "Saving…" : "Save changes"}</button>; }

function HolidaySection({ organizationId, holidays, timezone }: { organizationId: string; holidays: Props["holidays"]; timezone: string }) {
  const [state, action] = useActionState(createHoliday, initialState);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcoming = holidays.filter((holiday) => holiday.date >= today);
  const past = holidays.filter((holiday) => holiday.date < today);
  return <section className="rounded-[1.25rem] border border-[#e1e6ed] bg-white"><div className="border-b border-[#edf0f4] px-5 py-5 sm:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#3d6fc5]">Business calendar</p><h2 className="mt-1.5 text-xl font-semibold text-[#253047]">Organization holidays</h2><p className="mt-1.5 text-sm leading-6 text-[#7c8799]">Holidays are excluded from future attendance, leave and report expectations. Past entries remain read-only.</p></div><div className="space-y-6 p-5 sm:p-6">
    <form action={action} className="grid gap-3 rounded-2xl border border-[#dce6f7] bg-[#f7faff] p-4 sm:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.4fr_auto]"><input type="hidden" name="organizationId" value={organizationId} /><Field label="Date"><input className={control} type="date" name="holidayDate" min={today} required /></Field><Field label="Holiday name"><input className={control} name="name" required placeholder="Diwali" /></Field><Field label="Description"><input className={control} name="description" placeholder="Optional note" /></Field><div className="flex items-end"><button className="h-11 w-full rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d55c6]">Add holiday</button></div></form>
    {state.message ? <p role="status" className={`rounded-xl px-3 py-2 text-sm ${state.success ? "bg-[#eaf8f2] text-[#157357]" : "bg-[#fff1f0] text-[#a43b32]"}`}>{state.message}</p> : null}
    <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[#344054]">Upcoming holidays</h3><span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-xs font-semibold text-[#2555a7]">{upcoming.length}</span></div>{upcoming.length ? <div className="space-y-2">{upcoming.map((holiday) => <HolidayRow key={holiday.id} organizationId={organizationId} holiday={holiday} minDate={today} />)}</div> : <div className="rounded-xl border border-dashed border-[#d7dde6] py-10 text-center text-sm text-[#98a2b3]">No upcoming holidays configured.</div>}</div>
    {past.length ? <details className="rounded-xl border border-[#e6eaf0]"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#667085]">Historical holidays ({past.length})</summary><div className="divide-y border-t border-[#edf0f4]">{past.map((holiday) => <div key={holiday.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium text-[#667085]">{holiday.name}</p><p className="text-xs text-[#98a2b3]">{holiday.description || "No description"}</p></div><time className="font-mono text-xs text-[#98a2b3]">{holiday.date}</time></div>)}</div></details> : null}
  </div></section>;
}

function HolidayRow({ organizationId, holiday, minDate }: { organizationId: string; holiday: Props["holidays"][number]; minDate: string }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateHoliday, initialState);
  const [deleteState, deleteAction] = useActionState(deleteHoliday, initialState);
  if (editing) return <form action={updateAction} className="grid gap-2 rounded-xl border border-[#bfd1ef] bg-[#f8fbff] p-3 sm:grid-cols-[0.8fr_1fr_1.4fr_auto]"><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="holidayId" value={holiday.id} /><input className={control} type="date" name="holidayDate" min={minDate} defaultValue={holiday.date} required /><input className={control} name="name" defaultValue={holiday.name} required /><input className={control} name="description" defaultValue={holiday.description ?? ""} /><div className="flex items-end gap-2"><button className="h-11 rounded-xl bg-[#172033] px-3 text-xs font-semibold text-white">Save</button><button type="button" onClick={() => setEditing(false)} className="h-11 rounded-xl border px-3 text-xs">Cancel</button></div>{updateState.message ? <p className="sm:col-span-full text-xs text-[#a43b32]">{updateState.message}</p> : null}</form>;
  return <div className="flex flex-col gap-3 rounded-xl border border-[#e3e8ef] p-4 sm:flex-row sm:items-center"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eef4ff] font-mono text-xs font-semibold text-[#2555a7]">{holiday.date.slice(5).replace("-", "/")}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#344054]">{holiday.name}</p><p className="truncate text-xs text-[#98a2b3]">{holiday.description || "No description"}</p></div><div className="flex gap-2"><button type="button" onClick={() => setEditing(true)} className="h-9 rounded-lg border border-[#dfe4eb] px-3 text-xs font-semibold text-[#536074]">Edit</button><form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Remove ${holiday.name}?`)) event.preventDefault(); }}><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="holidayId" value={holiday.id} /><button className="h-9 rounded-lg border border-[#f0cccc] px-3 text-xs font-semibold text-[#a43b32]">Remove</button></form></div>{deleteState.message ? <p className="text-xs text-[#a43b32] sm:basis-full">{deleteState.message}</p> : null}</div>;
}
