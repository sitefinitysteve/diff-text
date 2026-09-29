import type { HTMLAttributes, ReactElement } from 'react';
import type { MinimapLink } from '../model';
import { containerClass } from './types';

type DivProps = HTMLAttributes<HTMLDivElement>;

/**
 * Renders the diff as is, or, with `minimap`, wrapped as
 * `<div class="text-diff-with-minimap">{diff}<nav class="text-diff-minimap">…</nav></div>`
 * (SPEC section 21). The consumer's div props (className, id, ...) go on the outermost
 * element either way; `render` receives the props for the diff's own container.
 */
export function framed(
  minimap: boolean,
  links: MinimapLink[],
  base: string,
  className: string | undefined,
  outer: DivProps,
  render: (props: DivProps) => ReactElement,
): ReactElement {
  if (!minimap) return render({ ...outer, className: containerClass(base, className) });
  return (
    <div {...outer} className={containerClass('text-diff-with-minimap', className)}>
      {render({ className: base })}
      <nav className="text-diff-minimap" aria-label="Change minimap">
        {links.map((l) => (
          <a key={l.key} className={l.className} href={l.href} style={styleObject(l.style)} aria-label={l.label} />
        ))}
      </nav>
    </div>
  );
}

/** "a:b;c:d" → { a: 'b', c: 'd' } (React takes style objects; custom properties keep their name). */
export function styleObject(style: string | undefined): Record<string, string> | undefined {
  if (style === undefined) return undefined;
  const out: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i)] = decl.slice(i + 1);
  }
  return out;
}
