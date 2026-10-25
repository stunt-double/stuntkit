import { CheckBuilder } from '../check-builder.ts';
import { socialHandles } from '../parse.ts';
import type { DomainProbe } from '../probe.ts';
import { pageExists } from '../probe.ts';
import type { CategoryCheckResult } from '../types.ts';

// Known third-party live-chat / messaging widgets. If any of these scripts
// loads on the homepage, a human channel exists in-page.
const CHAT_SIGNATURES = [
  'intercom',
  'zendesk',
  'hubspot',
  'drift',
  'crisp.chat',
  'freshchat',
  'tidio',
  'livechatinc',
  'olark',
  'tawk.to',
];

// Permissive international phone pattern. Intentionally loose: any `tel:` link
// or a digit sequence that starts with `+` followed by 7+ digits counts.
const PHONE_RE = /(?:href=["']tel:[+\d][\d\s()-]{5,})|(?:\+\d[\d\s()-]{6,}\d)/i;

export function support(probe: DomainProbe): CategoryCheckResult {
  const b = new CheckBuilder('support');
  const html = probe.html;
  const anchors = (html?.anchors ?? []).join(' ').toLowerCase();
  const raw = html?.raw ?? '';

  const contactPage =
    pageExists(probe.extraPages['contact']) ||
    pageExists(probe.extraPages['contactSales']) ||
    /\/contact/.test(anchors);
  b.add('contact', 'Contact page reachable or linked', 30, contactPage);
  if (!contactPage)
    b.friction(
      'high',
      'No contact page linked or reachable. Agents acting on a user’s behalf have nowhere to send a message.'
    );

  const emailMentioned = /(mailto:|(?:support|help|contact|hello|hi|info)@)/i.test(raw);
  b.add('support-email', 'A contact email is exposed', 25, emailMentioned);
  if (!emailMentioned)
    b.friction(
      'medium',
      'No contact email visible in server-rendered HTML. Agents can’t fall back to email.'
    );

  const chatWidget = CHAT_SIGNATURES.some((s) => (html?.lower ?? '').includes(s));
  b.add('chat-widget', 'Known live-chat / messaging widget embedded', 15, chatWidget);

  const helpHub =
    pageExists(probe.extraPages['support']) ||
    pageExists(probe.extraPages['help']) ||
    pageExists(probe.extraPages['faq']) ||
    /\/support|\/help|\/faq|\/faqs/.test(anchors);
  b.add('help-hub', 'Help, support, or FAQ hub linked', 15, helpHub);
  if (!helpHub)
    b.friction(
      'low',
      'No help, support, or FAQ hub linked. Agents can’t self-serve an answer before reaching out.'
    );

  const phone = PHONE_RE.test(raw);
  b.add('phone', 'A phone number is exposed', 10, phone);

  const socials = html ? socialHandles(html) : [];
  const directMessageable = socials.length >= 2;
  b.add(
    'social-dm',
    'At least 2 social profiles linked (DM-able fallback)',
    5,
    directMessageable,
    socials.join(', ')
  );

  return b.build();
}
