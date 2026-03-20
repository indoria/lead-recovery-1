import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  id: string;
  error?: string;
  hint?: string;
};

export function Input({ label, id, error, hint, className = "", ...props }: InputProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field">
      {label ? (
        <label htmlFor={id} className="field-label">
          {label}
          {props.required && (
            <span className="field-required" aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
      ) : null}
      <input
        {...props}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`field-input${error ? " field-input--error" : ""} ${className}`.trim()}
      />
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
