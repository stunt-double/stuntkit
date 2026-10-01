import type Anthropic from '@anthropic-ai/sdk';
import type { ModelMessage } from 'ai';

/**
 * The one screenshot pruner every browsing loop uses: the actor loops and the
 * Index arms in Trigger.dev, and the Index agent Worker.
 *
 * Screenshots dominate a browsing loop's input (each PNG is roughly 1,000 to
 * 2,000 tokens and the whole history is re-sent every turn), and the agent acts
 * on the page in front of it, so only the newest few are worth re-sending.
 * Older ones become a placeholder rather than disappearing, so the transcript
 * still reads as a sequence of observations.
 *
 * Counting is per image, newest first, across user messages and tool results.
 * Per image rather than per tool result because the browser toolset returns one
 * tool result per turn holding a screenshot for every action in the batch.
 *
 * Both functions are pure: they return a new array and never mutate the
 * messages they are given, so a caller can prune a copy it sends while keeping
 * the history it stores. Kept free of runtime imports so `node --test` loads it.
 */

/** What an older screenshot is replaced with, so the transcript still reads as a sequence of observations. */
export const PRUNED_SCREENSHOT = '[earlier screenshot removed to save tokens]';

type Part = { type: string; mediaType?: string };

/** Whether an AI SDK content part is an image, in any of the shapes v7 uses. */
export function isAiSdkImagePart(part: Part | null | undefined): boolean {
  if (!part) return false;
  if (part.type === 'image' || part.type === 'image-data' || part.type === 'image-url') {
    return true;
  }
  if (part.type === 'file' || part.type === 'file-data' || part.type === 'media') {
    return (part.mediaType ?? '').startsWith('image/');
  }
  return false;
}

type Budget = { keep: number; kept: number };

/**
 * Walk `parts` newest first; images past the first `budget.keep` become the
 * placeholder. Returns the same array when nothing changed, a new one otherwise.
 */
function pruneList<P>(parts: readonly P[], isImage: (p: P) => boolean, budget: Budget): P[] {
  let out: P[] | null = null;
  for (let k = parts.length - 1; k >= 0; k--) {
    if (!isImage(parts[k])) continue;
    if (budget.kept++ < budget.keep) continue;
    out ??= parts.slice();
    out[k] = { type: 'text', text: PRUNED_SCREENSHOT } as P;
  }
  return out ?? (parts as P[]);
}

export function pruneAiSdkImages(messages: readonly ModelMessage[], keep: number): ModelMessage[] {
  const budget: Budget = { keep, kept: 0 };
  const out = messages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role === 'user' && Array.isArray(m.content)) {
      const content = pruneList(m.content, (p) => isAiSdkImagePart(p as Part), budget);
      if (content !== m.content) out[i] = { ...m, content };
    } else if (m.role === 'tool') {
      let content: typeof m.content | null = null;
      for (let j = m.content.length - 1; j >= 0; j--) {
        const part = m.content[j];
        if (part.type !== 'tool-result' || part.output.type !== 'content') continue;
        const value = pruneList(part.output.value, (p) => isAiSdkImagePart(p as Part), budget);
        if (value === part.output.value) continue;
        content ??= m.content.slice();
        content[j] = { ...part, output: { ...part.output, value } };
      }
      if (content) out[i] = { ...m, content };
    }
  }
  return out;
}

export function pruneAnthropicImages(
  messages: readonly Anthropic.Messages.MessageParam[],
  keep: number
): Anthropic.Messages.MessageParam[] {
  const budget: Budget = { keep, kept: 0 };
  const isImage = (b: { type: string }) => b.type === 'image';
  const out = messages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    let content: typeof m.content | null = null;
    for (let j = m.content.length - 1; j >= 0; j--) {
      const block = m.content[j];
      if (block.type === 'image') {
        if (budget.kept++ < budget.keep) continue;
        content ??= m.content.slice();
        content[j] = { type: 'text', text: PRUNED_SCREENSHOT };
      } else if (block.type === 'tool_result' && Array.isArray(block.content)) {
        const inner = pruneList(block.content, isImage, budget);
        if (inner === block.content) continue;
        content ??= m.content.slice();
        content[j] = { ...block, content: inner };
      }
    }
    if (content) out[i] = { ...m, content };
  }
  return out;
}
