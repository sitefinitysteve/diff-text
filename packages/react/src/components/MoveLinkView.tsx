import type { MoveLink } from '../model';

/** The counterpart link of a moved row or cell. */
export function MoveLinkView({ link }: { link: MoveLink | null }) {
  if (!link) return null;
  return (
    <a className="diff-move-link" id={link.id} href={link.href}>
      {link.text}
    </a>
  );
}
