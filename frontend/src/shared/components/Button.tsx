import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "secondary", className, type = "button", ...rest }: Props) {
  const cls = [styles.button, variant === "primary" ? styles.primary : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={cls} {...rest} />;
}
