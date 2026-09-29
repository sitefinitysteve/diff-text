import { cloneVNode, defineComponent, h, mergeProps } from 'vue';
import type { PropType, VNode } from 'vue';
import type { MinimapLink } from '../model';

/**
 * Internal. Renders its single slot element as is, or, when `enabled`, wraps it as
 * `<div class="text-diff-with-minimap">{diff}<nav class="text-diff-minimap">…</nav></div>`
 * (SPEC section 21). Fallthrough attributes of the diff component land on the outermost
 * element either way.
 */
export default defineComponent({
  name: 'MinimapFrame',
  inheritAttrs: false,
  props: {
    enabled: { type: Boolean, default: false },
    links: { type: Array as PropType<MinimapLink[]>, default: () => [] },
  },
  setup(props, { slots, attrs }) {
    return () => {
      const diff = (slots.default?.() ?? [])[0] as VNode;
      if (!props.enabled) return cloneVNode(diff, attrs);
      const nav = h(
        'nav',
        { class: 'text-diff-minimap', 'aria-label': 'Change minimap' },
        props.links.map((l) => h('a', { key: l.key, class: l.className, href: l.href, style: l.style, 'aria-label': l.label })),
      );
      return h('div', mergeProps({ class: 'text-diff-with-minimap' }, attrs), [diff, nav]);
    };
  },
});
