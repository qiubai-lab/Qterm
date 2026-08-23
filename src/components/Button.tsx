import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "dangerSolid";
export type ButtonSize = "regular" | "compact";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "regular",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return <button
    {...props}
    type={type}
    className={joinClasses("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >{children}</button>;
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  variant?: "quiet" | "secondary" | "danger";
  size?: ButtonSize;
  loading?: boolean;
}

export function IconButton({
  label,
  variant = "quiet",
  size = "regular",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: IconButtonProps) {
  return <button
    {...props}
    type={type}
    aria-label={label}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
    className={joinClasses("ui-icon-button", `ui-icon-button--${variant}`, `ui-icon-button--${size}`, className)}
  >{children}</button>;
}

export function StatusBadge({
  tone = "neutral",
  presentation = "status",
  size = "regular",
  className,
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  presentation?: "status" | "tag";
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return <span className={joinClasses("ui-status-badge", `ui-status-badge--${tone}`, `ui-status-badge--${presentation}`, `ui-status-badge--${size}`, className)}>
    {presentation === "status" && <span className="ui-status-badge-dot" aria-hidden="true"/>}
    {children}
  </span>;
}

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}
