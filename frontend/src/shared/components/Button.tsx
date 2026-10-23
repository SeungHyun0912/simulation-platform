import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary";

function classes(variant: Variant, extra?: string) {
  return [styles.button, variant === "primary" ? styles.primary : "", extra ?? ""]
    .filter(Boolean)
    .join(" ");
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "secondary", className, type = "button", ...rest }: Props) {
  return <button type={type} className={classes(variant, className)} {...rest} />;
}

/** 버튼 모양의 링크. 화면 이동은 링크로, 동작은 버튼으로 구분한다. */
export function LinkButton({
  variant = "secondary",
  className,
  ...rest
}: LinkProps & { variant?: Variant }) {
  return <Link className={`${classes(variant, className)} ${styles.link}`} {...rest} />;
}
