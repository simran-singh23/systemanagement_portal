"use client";

import { useActionState } from "react";
import { updateAutomationSettings, type AutomationSettingsState } from "@/actions/automation.actions";

type Props = { organizationId: string; canManage: boolean; settings: {
  timezone: string; workdayStart: string; workdayEnd: string; workDays: number[]; checkInReminderTime: string; checkInCutoffTime: string; lunchReminderTime: string; dailyReportReminderTime: string; dailyReportDueTime: string; managerSummaryTime: string; taskDeadlineReminderHours: number[];
  enableCheckInReminders: boolean; enableMissingCheckInAlerts: boolean; notifyManagersMissingCheckIn: boolean; enableLunchReminders: boolean; enableTaskDeadlineReminders: boolean; notifyManagersOverdueTasks: boolean; enableDailyReportReminders: boolean; enableMissingReportAlerts: boolean; notifyManagersMissingReports: boolean; enableDailyTeamSummary: boolean;
} };

const initial: AutomationSettingsState = {};
const input = "mt-1.5 h-10 w-full rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#344054] outline-none focus:border-[#80a7f5] focus:ring-2 focus:ring-[#dce8ff] disabled:bg-[#f7f8fa]";

export function AutomationSettingsForm({ organizationId, canManage, settings }: Props) {
  const [state, action, pending] = useActionState(updateAutomationSettings, initial);
  return <form action={action} className="space-y-5">
    <input type="hidden" name="organizationId" value={organizationId} />
    <fieldset disabled={!canManage || pending} className="space-y-5 disabled:opacity-70">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Timezone"><input name="timezone" defaultValue={settings.timezone} className={input} /></Field>
        <Field label="Office start"><input type="time" name="workdayStart" defaultValue={settings.workdayStart} className={input} /></Field>
        <Field label="Office end"><input type="time" name="workdayEnd" defaultValue={settings.workdayEnd} className={input} /></Field>
        <Field label="Check-in reminder"><input type="time" name="checkInReminderTime" defaultValue={settings.checkInReminderTime} className={input} /></Field>
        <Field label="Missing check-in cutoff"><input type="time" name="checkInCutoffTime" defaultValue={settings.checkInCutoffTime} className={input} /></Field>
        <Field label="Lunch reminder"><input type="time" name="lunchReminderTime" defaultValue={settings.lunchReminderTime} className={input} /></Field>
        <Field label="Report reminder"><input type="time" name="dailyReportReminderTime" defaultValue={settings.dailyReportReminderTime} className={input} /></Field>
        <Field label="Report due time"><input type="time" name="dailyReportDueTime" defaultValue={settings.dailyReportDueTime} className={input} /></Field>
        <Field label="Manager summary"><input type="time" name="managerSummaryTime" defaultValue={settings.managerSummaryTime} className={input} /></Field>
        <Field label="Task windows (hours)"><input name="taskDeadlineReminderHours" defaultValue={settings.taskDeadlineReminderHours.join(", ")} className={input} /></Field>
      </div>
      <div><p className="mb-2 text-xs font-medium text-[#667085]">Working days</p><div className="flex flex-wrap gap-2">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, value) => <label key={day} className="flex items-center gap-2 rounded-xl border border-[#e6eaf0] px-3 py-2 text-xs text-[#344054]"><input type="checkbox" name="workDays" value={value} defaultChecked={settings.workDays.includes(value)} className="size-4 accent-[#2563eb]" />{day}</label>)}</div></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Toggle name="enableCheckInReminders" label="Check-in reminders" checked={settings.enableCheckInReminders} />
        <Toggle name="enableMissingCheckInAlerts" label="Missing check-in alerts" checked={settings.enableMissingCheckInAlerts} />
        <Toggle name="notifyManagersMissingCheckIn" label="Manager check-in alerts" checked={settings.notifyManagersMissingCheckIn} />
        <Toggle name="enableLunchReminders" label="Lunch reminders" checked={settings.enableLunchReminders} />
        <Toggle name="enableTaskDeadlineReminders" label="Task deadline reminders" checked={settings.enableTaskDeadlineReminders} />
        <Toggle name="notifyManagersOverdueTasks" label="Manager overdue alerts" checked={settings.notifyManagersOverdueTasks} />
        <Toggle name="enableDailyReportReminders" label="Daily report reminders" checked={settings.enableDailyReportReminders} />
        <Toggle name="enableMissingReportAlerts" label="Missing report alerts" checked={settings.enableMissingReportAlerts} />
        <Toggle name="notifyManagersMissingReports" label="Manager report alerts" checked={settings.notifyManagersMissingReports} />
        <Toggle name="enableDailyTeamSummary" label="Daily team summary" checked={settings.enableDailyTeamSummary} />
      </div>
      {canManage ? <button className="h-10 rounded-xl bg-[#172033] px-5 text-sm font-semibold text-white hover:bg-[#253047] disabled:opacity-60">{pending ? "Saving…" : "Save automation settings"}</button> : <p className="text-xs text-[#7c8799]">Only organization administrators can change these settings.</p>}
    </fieldset>
    {state.message ? <p role="status" className={`rounded-xl px-3 py-2 text-sm ${state.success ? "bg-[#eaf8f2] text-[#157357]" : "bg-[#fff1f0] text-[#a43b32]"}`}>{state.message}</p> : null}
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-medium text-[#667085]">{label}{children}</label>; }
function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label className="flex items-center gap-3 rounded-xl border border-[#e6eaf0] px-3 py-2.5 text-sm text-[#344054]"><input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-[#2563eb]" />{label}</label>; }
