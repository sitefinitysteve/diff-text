import type { HTMLAttributes } from 'react';

/**
 * Props shared by every diff component. Any other `<div>` attribute
 * (`className`, `style`, `id`, `data-*`, event handlers, ...) is forwarded
 * onto the outermost element, mirroring Vue's attribute fallthrough.
 */
export interface BaseDiffProps<TOptions> extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> {
  /** The original text. */
  oldText: string;
  /** The new text to compare against `oldText`. */
  newText: string;
  /** Options for the underlying diff. */
  options?: TOptions;
}

/** Props of every component that can emit element ids (SPEC section 18). */
export interface IdProps {
  /**
   * Prefix for every emitted id. Default: "td-" + React's useId() (unique per instance,
   * stable across SSR and hydration).
   */
  idPrefix?: string;
  /** Put id="{idPrefix}-change-N" on every element that carries data-change-index="N". Default false. */
  anchors?: boolean;
}

/** Joins the component's own container classes with a consumer `className`. */
export function containerClass(base: string, className?: string): string {
  return className ? `${base} ${className}` : base;
}
