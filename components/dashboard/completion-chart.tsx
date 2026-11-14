"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import styles from "./overview.module.css";

export type CompletionDay = { date: string; label: string; fullLabel: string; count: number; due: number };

export function CompletionChart({ days }: { days: CompletionDay[] }) {
  const [range, setRange] = useState(7);
  const [selected, setSelected] = useState<string | null>(null);
  const visible = days.slice(-range);
  const total = visible.reduce((sum, day) => sum + day.count, 0);
  const maximum = Math.max(4, ...visible.flatMap((day) => [day.count, day.due]));
  const active = visible.find((day) => day.date === selected);

  return <section className={styles.panel} aria-labelledby="completion-title">
    <div className={styles.panelHeading}>
      <div><h2 id="completion-title">Weekly throughput</h2><p className={styles.description}>Tasks due and completed each day</p></div>
      <div className={styles.range} role="group" aria-label="Completion chart period">
        {[7, 14, 30].map((value) => <button key={value} type="button" aria-pressed={range === value} onClick={() => { setRange(value); setSelected(null); }}>{value} days</button>)}
      </div>
    </div>
    <div className={styles.chartSummary}><strong>{total}</strong><span>{total === 1 ? "task" : "tasks"} completed<span className={styles.chartCaption}>Over the last {range} days</span></span><Link href="/dashboard/analytics" aria-label="Explore task analytics"><Icon name="arrowRight" className="size-5" /></Link></div>
    <div className={styles.chart}>
      <div className={styles.chartScale} aria-hidden="true"><span>{maximum}</span><span>{Math.round(maximum / 2)}</span><span>0</span></div>
      <div className={styles.bars}>
        {visible.map((day, index) => <button type="button" key={day.date} aria-label={`${day.fullLabel}: ${day.due} due, ${day.count} completed`} aria-pressed={active?.date === day.date} onMouseEnter={() => setSelected(day.date)} onClick={() => setSelected(day.date)} onFocus={() => setSelected(day.date)} className={styles.barColumn}>
          <span className={styles.barTrack}><span className={styles.dueBar} style={{ height: `${day.due / maximum * 100}%` }} /><span className={`${styles.bar} ${index === visible.length - 1 ? styles.todayBar : ""}`} style={{ height: `${day.count / maximum * 100}%` }} /><span className={styles.zeroMark} hidden={day.count !== 0 || day.due !== 0} /></span>
          <span className={styles.barLabel}>{range === 30 && index % 5 !== 0 && index !== visible.length - 1 ? "" : day.label}</span>
        </button>)}
      </div>
    </div>
    <div className={styles.chartLegend}><span><i style={{ background: "var(--chart-due)" }} />Due</span><span><i style={{ background: "var(--blue)" }} />Completed</span></div>
    <div className={styles.chartFooter} aria-live="polite">{active ? <span className={styles.chartTooltip}>{active.fullLabel} · {active.due} due · {active.count} completed</span> : total ? "Select a day to explore the work completed" : "No completed tasks in this period"}</div>
  </section>;
}
