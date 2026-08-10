import type { App } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { ElTooltip } from 'element-plus';

/**
 * 在非行首的数字序号前插入换行，便于 tooltip 长文分段展示。
 * 识别 `1.` / `2、` / `3．`；序号后须接空白或中文，避免误伤 12.5、V1.0。
 * rawContent=true（HTML 原文）时不改写。
 */
export function formatTooltipContent(content: unknown, rawContent = false): unknown {
  if (rawContent || typeof content !== 'string' || !content) return content;
  return content
    .replace(/\r\n/g, '\n')
    .replace(/([^\n])\s*(?=[1-9]\d*[.、．](?:[\s\u3000\u00a0]+|(?=[\u4e00-\u9fff])))/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 覆盖全局 ElTooltip：content 文案自动按数字序号换行（#content 插槽不改写） */
export function patchElTooltip(app: App) {
  const Patched = defineComponent({
    name: 'ElTooltip',
    inheritAttrs: false,
    setup(_, { attrs, slots, expose }) {
      const tipRef = ref<{ [key: string]: unknown } | null>(null);
      expose(
        new Proxy(
          {},
          {
            get: (_t, key: string | symbol) => {
              const inst = tipRef.value;
              if (!inst) return undefined;
              const val = inst[key as string];
              return typeof val === 'function' ? val.bind(inst) : val;
            },
          },
        ),
      );
      return () => {
        const next = { ...attrs } as Record<string, unknown>;
        const raw = Boolean(next['raw-content'] ?? next.rawContent);
        if (typeof next.content === 'string') {
          next.content = formatTooltipContent(next.content, raw);
        }
        return h(ElTooltip, { ...next, ref: tipRef }, slots);
      };
    },
  });
  app.component('ElTooltip', Patched);
}
