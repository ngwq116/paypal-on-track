"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

// Disables every button of the form while it submits, and relabels the one that was clicked.
export default function SubmitButton(props: {
  children: ReactNode;
  pending: string;
  className?: string;
  formAction?: (form: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
}) {
  const status = useFormStatus();
  const mine = status.pending && (!props.formAction || status.action === props.formAction);
  return (
    <button className={props.className} formAction={props.formAction} formNoValidate={props.formNoValidate} disabled={status.pending}>
      {mine ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          {props.pending}
        </>
      ) : (
        props.children
      )}
    </button>
  );
}
