"use client";

import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import type { ProviderName } from "@/lib/ai/catalog";

// Brand logos for the provider switcher. We lean on @lobehub/icons for the
// providers it ships (Claude, OpenAI, Gemini, Google) and inline the Cursor mark
// locally — lobehub's Cursor icon is theme-aware and pulls in antd-style, which we
// don't want in the bundle. We import each icon's *leaf component file* (not the
// icon's index, which re-exports an `Avatar` variant that transitively pulls in
// antd-style → antd, a peer we deliberately didn't install). This keeps the other
// ~200 icons and antd out of the bundle, even in dev where Next doesn't tree-shake.
// `codex` is OpenAI's CLI and `agy` (Antigravity) is a Google product, so they
// reuse those brand marks.

function CursorIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flex: "none", lineHeight: 1 }}
      aria-hidden="true"
    >
      <title>Cursor</title>
      <path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z" />
    </svg>
  );
}

const ICONS: Record<ProviderName, (props: { size?: number }) => JSX.Element> = {
  "claude-api": (p) => <ClaudeColor {...p} />,
  "claude-cli": (p) => <ClaudeColor {...p} />,
  openai: (p) => <OpenAIMono {...p} />,
  codex: (p) => <OpenAIMono {...p} />,
  google: (p) => <GeminiColor {...p} />,
  agy: (p) => <GoogleColor {...p} />,
  "cursor-cli": (p) => <CursorIcon {...p} />,
};

export default function ProviderIcon({
  provider,
  size = 16,
}: {
  provider: ProviderName;
  size?: number;
}) {
  const Icon = ICONS[provider];
  if (!Icon) return null;
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <Icon size={size} />
    </span>
  );
}
