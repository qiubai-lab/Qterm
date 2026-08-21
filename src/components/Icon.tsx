import type { ReactNode } from "react";

export type IconName = "workspace" | "plus" | "terminal" | "browser" | "computer" | "server" | "network" | "connections" | "files" | "file" | "filePlus" | "folderPlus" | "edit" | "save" | "check" | "checkCircle" | "copy" | "upload" | "key" | "lock" | "trash" | "clear" | "back" | "forward" | "chevronDown" | "refresh" | "settings" | "help" | "splitHorizontal" | "splitVertical" | "menu" | "windowMinimize" | "windowMaximize" | "close" | "more" | "eye" | "eyeOff";

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    workspace: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></>,
    computer: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    server: <><rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/></>,
    network: <><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.5 11 9-4M7.5 13l9 4"/></>,
    connections: <><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="m9 11 6-4M9 13l6 4"/></>,
    files: <><path d="M4 5a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/></>,
    file: <><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5"/></>,
    filePlus: <><path d="M4 4h9l4 4v12H4Z"/><path d="M13 4v4h4"/><path d="M17.5 12.5v7M14 16h7"/></>,
    folderPlus: <><path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 14h6M12 11v6"/></>,
    edit: <><path d="m14.5 5.5 4 4M4 20l3.5-.7L19 7.8a2.1 2.1 0 0 0-3-3L4.7 16.2Z"/><path d="m13.8 6.2 4 4"/></>,
    save: <><path d="M5 4h12l2 2v14H5Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    checkCircle: <><circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.1 2.5 2.5 5-5.2"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/></>,
    key: <><circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20 12v2"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    clear: <><path d="m15 4 5 5-9 9H6l-2-2Z"/><path d="m12 17 3 3M4 20h16"/></>,
    back: <path d="m15 6-6 6 6 6"/>,
    forward: <path d="m9 6 6 6-6 6"/>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    refresh: <><path d="M19 7v5h-5"/><path d="M18 12a6 6 0 1 0-1.8 4.3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></>,
    splitHorizontal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></>,
    splitVertical: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/></>,
    menu: <path d="M6 8h12M6 12h12M6 16h12"/>,
    windowMinimize: <path d="M5 12h14"/>,
    windowMaximize: <rect x="5" y="5" width="14" height="14" rx="1"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m4 4 16 16M10.6 6.2A10.4 10.4 0 0 1 12 6c6 0 9.5 6 9.5 6a15.8 15.8 0 0 1-2.2 2.8M6.6 6.7C4 8.3 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
  };
  return <svg aria-hidden="true" data-icon={name} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
