"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ClipboardList, FileText, Search, UserRound, UsersRound, X } from "lucide-react";
import type { GlobalSearchResponse, SearchCategory, SearchResult } from "@/lib/search/types";

const categoryIcons = { employees: UsersRound, tasks: ClipboardList, reports: FileText, attendance: CalendarCheck, leave: UserRound } satisfies Record<SearchCategory, typeof Search>;
const emptyResponse: GlobalSearchResponse = { query: "", groups: [] };

export function GlobalSearch() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, GlobalSearchResponse>());
  const requestId = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState(emptyResponse);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const results = useMemo(() => response.groups.flatMap((group) => group.results), [response]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); window.setTimeout(() => inputRef.current?.focus(), 0); }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (query.length < 2) return;
    const normalized = query.toLocaleLowerCase();
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      const cached = cache.current.get(normalized);
      if (cached) { setResponse(cached); setLoading(false); setError(""); return; }
      setLoading(true); setError("");
      try {
        const result = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!result.ok) throw new Error("SEARCH_FAILED");
        const data = await result.json() as GlobalSearchResponse;
        if (currentRequest !== requestId.current) return;
        cache.current.set(normalized, data); setResponse(data); setSelected(0);
      } catch (reason) {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        setError(reason instanceof Error && reason.message === "SEARCH_FAILED" ? "Search could not load. Try again." : "Search was interrupted.");
      } finally { if (currentRequest === requestId.current) setLoading(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function close() { setOpen(false); }
  function change(value: string) {
    setQuery(value);
    setSelected(0);
    if (value.trim().length < 2) { requestId.current += 1; setResponse(emptyResponse); setLoading(false); setError(""); }
  }
  function openResult(result: SearchResult) { close(); router.push(result.href); }
  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setSelected((value) => (value + 1) % results.length); }
    if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setSelected((value) => (value - 1 + results.length) % results.length); }
    if (event.key === "Enter" && results[selected]) { event.preventDefault(); openResult(results[selected]); }
  }

  let resultIndex = -1;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="hidden h-10 w-full max-w-sm items-center gap-2.5 rounded-xl border border-[#e1e6ed] bg-[#f8fafc] px-3 text-left text-[#98a2b3] transition hover:border-[#b9c9e4] hover:bg-white md:flex" aria-label="Open global search"><Search className="size-[18px] shrink-0" /><span className="min-w-0 flex-1 text-sm">Search anything...</span><kbd className="rounded-md border border-[#dfe3ea] bg-white px-1.5 py-0.5 text-[10px] text-[#7c8799]">⌘ / Ctrl K</kbd></button>
    <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-xl border border-[#e6eaf0] bg-white text-[#667085] md:hidden" aria-label="Open global search"><Search className="size-[18px]" /></button>
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpen(false)} className="m-auto w-[calc(100%-1rem)] max-w-2xl overflow-hidden rounded-[1.25rem] border border-[#d9e1ec] bg-white p-0 text-[#253047] shadow-[0_32px_90px_rgba(15,23,42,.28)] backdrop:bg-[#101828]/45 backdrop:backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-[#e9edf2] px-4 sm:px-5"><Search className="size-5 shrink-0 text-[#2563eb]" /><input ref={inputRef} value={query} onChange={(event) => change(event.target.value)} onKeyDown={onInputKeyDown} className="h-16 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#98a2b3]" placeholder="Search people, tasks, reports, attendance or leave" aria-label="Search TeamFlow" aria-controls="global-search-results" aria-activedescendant={results[selected] ? `search-result-${results[selected].category}-${results[selected].id}` : undefined} /><span className="hidden text-[11px] text-[#98a2b3] sm:block">↑↓ navigate · ↵ open</span><button type="button" onClick={close} className="grid size-8 place-items-center rounded-lg text-[#7c8799] hover:bg-[#f2f4f7]" aria-label="Close search"><X className="size-4" /></button></div>
      <div id="global-search-results" className="max-h-[min(65vh,32rem)] overflow-y-auto p-2 sm:p-3" role="listbox">
        {query.trim().length < 2 ? <SearchState icon={<Search className="size-5" />} title="Search the workspace" detail="Type at least two characters. Results follow your role and team access." /> : loading ? <SearchState icon={<span className="size-5 animate-spin rounded-full border-2 border-[#b9cae8] border-t-[#2563eb]" />} title="Searching…" detail="Checking authorized workspace records." /> : error ? <SearchState icon={<X className="size-5" />} title="Search unavailable" detail={error} tone="error" /> : !results.length ? <SearchState icon={<Search className="size-5" />} title="No matching records" detail="Try a name, task title, date, status or shorter phrase." /> : response.groups.map((group) => <section key={group.category} className="py-1.5"><h2 className="px-3 py-2 text-xs font-semibold text-[#7c8799]">{group.label}</h2><div>{group.results.map((result) => { resultIndex += 1; const index = resultIndex; const ResultIcon = categoryIcons[result.category]; return <button id={`search-result-${result.category}-${result.id}`} role="option" aria-selected={selected === index} key={`${result.category}-${result.id}`} type="button" onMouseEnter={() => setSelected(index)} onClick={() => openResult(result)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected === index ? "bg-[#eef4ff]" : "hover:bg-[#f7f8fa]"}`}><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected === index ? "bg-white text-[#2563eb] shadow-sm" : "bg-[#f2f4f7] text-[#667085]"}`}><ResultIcon className="size-[17px]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#344054]">{result.title}</span><span className="mt-0.5 block truncate text-xs text-[#7c8799]">{result.description}</span></span><span className="hidden rounded-md bg-white/70 px-2 py-1 text-[10px] capitalize text-[#98a2b3] sm:block">{result.category}</span></button>; })}</div></section>)}
      </div>
      <footer className="flex items-center justify-between border-t border-[#edf0f4] bg-[#fafbfc] px-4 py-2.5 text-[11px] text-[#98a2b3]"><span>Authorized results only</span><span>Esc to close</span></footer>
    </dialog>
  </>;
}

function SearchState({ icon, title, detail, tone = "default" }: { icon: React.ReactNode; title: string; detail: string; tone?: "default" | "error" }) { return <div className="grid min-h-56 place-items-center px-6 text-center"><div><span className={`mx-auto grid size-11 place-items-center rounded-xl ${tone === "error" ? "bg-[#fff1f0] text-[#b5473c]" : "bg-[#eef4ff] text-[#2563eb]"}`}>{icon}</span><p className="mt-4 text-sm font-semibold text-[#344054]">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#7c8799]">{detail}</p></div></div>; }
