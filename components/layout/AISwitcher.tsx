"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AISettings,
  Effort,
  ProviderName,
  ProviderSpec,
} from "@/lib/ai/catalog";
import ProviderIcon from "./ProviderIcon";

const selectClass =
  "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-40";

export default function AISwitcher({
  settings,
  catalog,
  available,
}: {
  settings: AISettings;
  catalog: ProviderSpec[];
  available: Record<ProviderName, boolean>;
}) {
  const router = useRouter();
  const [value, setValue] = useState<AISettings>(settings);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const providerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const spec = catalog.find((p) => p.name === value.provider);
  const models = spec?.models ?? [];
  const efforts = models.find((m) => m.id === value.model)?.efforts ?? [];

  async function commit(next: AISettings) {
    setValue(next);
    setSaving(true);
    try {
      await fetch("/api/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function chooseProvider(name: ProviderName) {
    setOpen(false);
    if (name === value.provider) return;
    const p = catalog.find((c) => c.name === name);
    const model = p?.models[0]?.id ?? value.model;
    const eff = p?.models[0]?.efforts ?? [];
    commit({ provider: name, model, effort: defaultEffort(eff) });
  }

  function chooseModel(modelId: string) {
    const eff = models.find((m) => m.id === modelId)?.efforts ?? [];
    commit({ ...value, model: modelId, effort: defaultEffort(eff) });
  }

  function chooseEffort(effort: string) {
    commit({ ...value, effort: (effort || null) as Effort | null });
  }

  return (
    <div className="flex items-center gap-1" title="AI provider / model / effort" aria-busy={saving}>
      <div className="relative" ref={providerRef}>
        <button
          type="button"
          className={`${selectClass} flex items-center gap-1.5`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title="AI provider"
        >
          {spec && <ProviderIcon provider={spec.name} size={14} />}
          <span>{spec?.label ?? value.provider}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            className="text-neutral-500"
            aria-hidden="true"
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 max-h-72 w-48 overflow-auto rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-lg"
          >
            {catalog.map((p) => {
              const isAvailable = available[p.name];
              const selected = p.name === value.provider;
              return (
                <li key={p.name} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => chooseProvider(p.name)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                      selected ? "bg-neutral-800 text-neutral-100" : "text-neutral-200"
                    } ${
                      isAvailable
                        ? "hover:bg-neutral-800"
                        : "cursor-not-allowed opacity-40"
                    }`}
                  >
                    <ProviderIcon provider={p.name} size={16} />
                    <span className="flex-1 truncate">{p.label}</span>
                    {!isAvailable && (
                      <span className="text-[10px] text-neutral-500">
                        {p.kind === "cli" ? "not installed" : "no key"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <select
        className={selectClass}
        value={value.model}
        onChange={(e) => chooseModel(e.target.value)}
        disabled={value.provider === "agy"}
        title={
          value.provider === "agy"
            ? "Antigravity runs whichever model is selected in your agy CLI — Genboard can't set it here."
            : "Model"
        }
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={value.effort ?? ""}
        onChange={(e) => chooseEffort(e.target.value)}
        disabled={efforts.length === 0}
        title={efforts.length === 0 ? "No effort control for this model" : "Reasoning effort"}
      >
        {efforts.length === 0 ? (
          <option value="">—</option>
        ) : (
          efforts.map((eff) => (
            <option key={eff} value={eff}>
              {eff}
            </option>
          ))
        )}
      </select>
    </div>
  );
}

function defaultEffort(efforts: Effort[]): Effort | null {
  if (efforts.length === 0) return null;
  return efforts.includes("high") ? "high" : efforts[0];
}
