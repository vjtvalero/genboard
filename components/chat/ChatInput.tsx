"use client";

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-end gap-2 border-t border-neutral-800 bg-neutral-900/40 p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled && value.trim()) onSend();
          }
        }}
        rows={2}
        placeholder="Talk to the engineer about this task… (Enter to send, Shift+Enter for newline)"
        className="min-h-[2.5rem] flex-1 resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="accent-bg shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {disabled ? "…" : "Send"}
      </button>
    </div>
  );
}
