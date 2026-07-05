// Icônes providers — approximations sobres (starburst Anthropic, nœud OpenAI)
import type { ReactNode } from "react";

type IconProps = { size?: number };

function StrokeIcon({ size = 13, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ClaudeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="#d97757" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4L3.4 12.6" />
    </svg>
  );
}

export function CodexIcon({ size = 13 }: { size?: number }) {
  // marque OpenAI (monochrome)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#c8cdd4">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zM13.2599 22.4301a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6455zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865a4.504 4.504 0 0 1-1.6464-6.1487zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"/>
    </svg>
  );
}

export function ProviderIcon({ provider, size = 13 }: { provider: string; size?: number }) {
  return provider === "codex" ? <CodexIcon size={size} /> : <ClaudeIcon size={size} />;
}

export function ResumeIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M8 2.2v7.2" />
      <path d="M5.2 6.8L8 9.6l2.8-2.8" />
      <path d="M3 12.8h10" />
    </StrokeIcon>
  );
}

export function ForkIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M4.2 3.2v3.4c0 1.1.9 2 2 2H8" />
      <path d="M4.2 12.8V9.4c0-1.1.9-2 2-2H8" />
      <path d="M8 4.5l3.8 3.5L8 11.5" />
    </StrokeIcon>
  );
}

export function BranchIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <circle cx="4" cy="4" r="1.6" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="4" cy="12" r="1.6" />
      <path d="M4 5.6v4.8" />
      <path d="M5.6 4h2.2c1.4 0 2.2.8 2.2 2.2V8" />
    </StrokeIcon>
  );
}

export function BookIcon({ size = 13 }: IconProps) {
  // étagère : deux livres droits + un incliné
  return (
    <StrokeIcon size={size}>
      <path d="M2.5 2.5h2.6v11H2.5z" />
      <path d="M5.1 2.5h2.6v11H5.1z" />
      <path d="M8.6 3.3l2.5-.7 2.9 10.6-2.5.7z" />
      <path d="M2.5 11h5.2" />
    </StrokeIcon>
  );
}

export function StarIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M8 2.2l1.7 3.5 3.8.6-2.8 2.7.7 3.8L8 11l-3.4 1.8.7-3.8-2.8-2.7 3.8-.6z" />
    </StrokeIcon>
  );
}

export function LedgerIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M4 2.5h7.2c.8 0 1.4.6 1.4 1.4v8.2c0 .8-.6 1.4-1.4 1.4H4c-.8 0-1.4-.6-1.4-1.4V3.9c0-.8.6-1.4 1.4-1.4z" />
      <path d="M5.2 5.4h5.4M5.2 8h5.4M5.2 10.6h3.2" />
    </StrokeIcon>
  );
}

export function CloseIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </StrokeIcon>
  );
}

export function RefreshIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M12.7 6.1A4.8 4.8 0 1 0 11.2 11" />
      <path d="M12.8 2.8v3.3H9.5" />
    </StrokeIcon>
  );
}

export function CopyIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <rect x="5.2" y="3.2" width="7.2" height="7.2" rx="1.4" />
      <path d="M3.6 5.6H2.8c-.7 0-1.2.5-1.2 1.2v5.4c0 .7.5 1.2 1.2 1.2h5.4c.7 0 1.2-.5 1.2-1.2v-.8" />
    </StrokeIcon>
  );
}

export function OpenIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M6.2 3.2H3.8c-.8 0-1.4.6-1.4 1.4v7.6c0 .8.6 1.4 1.4 1.4h7.6c.8 0 1.4-.6 1.4-1.4V9.8" />
      <path d="M9 2.5h4.5V7" />
      <path d="M8.2 7.8l5.1-5.1" />
    </StrokeIcon>
  );
}

export function PlusIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </StrokeIcon>
  );
}

export function ExpandIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M6 2H2v4M10 14h4v-4M2 6l4-4M14 10l-4 4" />
    </StrokeIcon>
  );
}

export function CollapseIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <path d="M2 6V2h4M14 10v4h-4M2 2l4.5 4.5M14 14l-4.5-4.5" />
    </StrokeIcon>
  );
}

export function SettingsIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1" />
    </StrokeIcon>
  );
}

export function SidebarIcon({ size = 13 }: IconProps) {
  return (
    <StrokeIcon size={size}>
      <rect x="2.2" y="3" width="11.6" height="10" rx="2" />
      <path d="M5.4 3v10" />
    </StrokeIcon>
  );
}

export function PanelIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2" />
      <path d="M9.8 2.8v10.4" />
    </svg>
  );
}

export function SearchIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.4" /><path d="M10.4 10.4L14 14" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3v10M3.6 8.8L8 13.2l4.4-4.4" />
    </svg>
  );
}

export function ZapIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.8 1.8L3.6 9h3.6l-.9 5.2L11.5 7H7.9l.9-5.2z" />
    </svg>
  );
}
