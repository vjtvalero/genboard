"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AISettings,
  Effort,
  ProviderName,
  ProviderSpec,
} from "@/lib/ai/catalog";

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
      <select
        className={selectClass}
        value={value.provider}
        onChange={(e) => chooseProvider(e.target.value as ProviderName)}
      >
        {catalog.map((p) => (
          <option key={p.name} value={p.name} disabled={!available[p.name]}>
            {p.label}
            {available[p.name] ? "" : p.kind === "cli" ? " (not installed)" : " (no key)"}
          </option>
        ))}
      </select>

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
