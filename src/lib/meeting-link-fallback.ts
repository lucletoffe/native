/**
 * undust: copy the meeting link into the fields every calendar shows.
 *
 * The editor's meeting link is saved as a JSCalendar virtual location, which
 * Stalwart sends as the iCalendar CONFERENCE property (RFC 7986). Google
 * Calendar and Outlook do not show CONFERENCE on an invitation from outside:
 * they show LOCATION and DESCRIPTION only, so an invitee there gets no link
 * at all (Togother meeting, 20/11/2026). The link is therefore also written
 * as the location, when the event has none, and at the end of the
 * description, unless the description already holds it.
 *
 * A link the event carried before (`previousLinks`) is replaced where it was
 * copied: a location equal to it takes the new link, its own line in the
 * description is dropped and any other mention is rewritten, so an invitee
 * never sees a stale room. Removing the meeting link removes those copies.
 *
 * Idempotent: applying it twice changes nothing more; a location the user
 * typed is never replaced. An HTML description gets the link as a paragraph
 * of its own, so it does not run into the last one.
 *
 * Same rules and signature as the webmail fork (lib/meeting-link-fallback.ts).
 */
import type { TranslateFn } from '../stores/locale-store';
import { escapeHtml } from './email-html';
import { undustMeetRoomOf } from './undust-meet';

export interface MeetingLinkFields {
  location: string;
  description: string;
}

export interface MeetingLinkOptions {
  /** Links the event or this form carried before, to be replaced. */
  previousLinks?: ReadonlyArray<string | null | undefined>;
  /** Every label a copied line may start with (both variants, all languages in use). */
  knownLabels?: ReadonlyArray<string>;
}

export function withMeetingLinkFallback(
  fields: MeetingLinkFields,
  link: string | null | undefined,
  label: string,
  options: MeetingLinkOptions = {},
): MeetingLinkFields {
  const uri = (link ?? '').trim();
  const previous = [...new Set((options.previousLinks ?? []).map((l) => (l ?? '').trim()))]
    .filter((l) => l && l !== uri);
  if (!uri && previous.length === 0) return fields;

  const labels = [...new Set([label, ...(options.knownLabels ?? [])].map((l) => l.trim()).filter(Boolean))];
  let location = fields.location;
  for (const old of previous) {
    if (location.trim() === old) location = uri;
  }
  if (uri && !location.trim()) location = uri;

  const description = looksLikeHtml(fields.description)
    ? htmlDescriptionWith(fields.description, uri, label.trim(), previous, labels)
    : plainDescriptionWith(fields.description, uri, label.trim(), previous, labels);

  return { location, description };
}

// The old link itself, not the start of a longer one (`…/j/123` in `…/j/123?pwd=…`).
function replaceLink(text: string, old: string, uri: string): string {
  const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escaped}(?![^\\s<>"'])`, 'g'), () => uri);
}

function plainDescriptionWith(
  text: string,
  uri: string,
  label: string,
  previous: string[],
  labels: string[],
): string {
  let description = text;
  for (const old of previous) {
    if (!description.includes(old)) continue;
    const lines = description.split('\n');
    const kept = lines.filter((line) => !labels.some((l) => line.trim() === `${l} ${old}`));
    if (kept.length !== lines.length) {
      description = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    }
    if (uri) description = replaceLink(description, old, uri);
  }
  if (!uri || description.includes(uri)) return description;
  const line = `${label} ${uri}`;
  const body = description.replace(/\s+$/, '');
  return body ? `${body}\n\n${line}` : line;
}

function htmlDescriptionWith(
  html: string,
  uri: string,
  label: string,
  previous: string[],
  labels: string[],
): string {
  let description = html;
  for (const old of previous) {
    for (const l of labels) {
      description = description.split(`<p>${escapeHtml(l)} ${escapeHtml(old)}</p>`).join('');
    }
    if (uri) {
      description = replaceLink(replaceLink(description, escapeHtml(old), escapeHtml(uri)), old, uri);
    }
  }
  if (!uri || description.includes(uri) || description.includes(escapeHtml(uri))) return description;
  return `${description.replace(/\s+$/, '')}<p>${escapeHtml(label)} ${escapeHtml(uri)}</p>`;
}

// Elements an HTML description is made of. The name must end the tag: an
// address in angle brackets (`Jean <a.dupont@example.com>`) or an Outlook
// plain-text link (`<https://…>`) is not HTML.
const HTML_TAG = /<\/?(?:p|div|br|span|a|b|i|u|em|strong|ul|ol|li|table|tr|td|h[1-6]|html|body|font)(?=[\s/>])[^>]*>/i;

// The app does not read the event's `descriptionContentType` (its
// CalendarEvent/get does not ask for it), so the text itself is looked at.
function looksLikeHtml(description: string): boolean {
  return HTML_TAG.test(description);
}

/**
 * Whether the save copies the meeting link into the location and the
 * description: on the user's own event only (someone else's invitation stays
 * as its organizer sent it), with a link now or before (the event's own, or
 * one this form generated then cleared, whose copies must go), and only when
 * the save changes something. An existing event saved untouched sends its
 * invitees no update.
 */
export function shouldCopyMeetingLink({
  organizes,
  existing,
  link,
  initialLink,
  previousLinks = [],
  formChanged,
}: {
  organizes: boolean;
  existing: boolean;
  link: string | null | undefined;
  initialLink: string | null | undefined;
  previousLinks?: ReadonlyArray<string | null | undefined>;
  formChanged: boolean;
}): boolean {
  const now = (link ?? '').trim();
  const before = (initialLink ?? '').trim();
  const hadLink = !!before || previousLinks.some((l) => !!(l ?? '').trim());
  if (!organizes || (!now && !hadLink)) return false;
  return !existing || now !== before || formChanged;
}

/**
 * Whether `link` is an undust visio room (meet.undust.co): only those open in
 * the browser with no account or app, which the longer label promises. Read
 * as the join button reads it, not through `URL`, whose React Native
 * polyfill neither folds the host's case nor stops at an `@` in the path.
 */
export function isUndustMeetLink(link: string | null | undefined): boolean {
  return undustMeetRoomOf(link) !== null;
}

const LONG_LABEL_KEY = 'calendar.form.meeting_link_description_label';
const LONG_LABEL_EN = 'Video call (browser, no account or app needed):';
const SHORT_LABEL_KEY = 'calendar.form.meeting_link_description_label_other';
const SHORT_LABEL_EN = 'Video call:';

/**
 * The words before the link in the description. Only an undust room is
 * promised to open with no account or app; a Zoom or Teams link pasted by
 * hand gets the plain label.
 */
export function meetingLinkLabel(t: TranslateFn, link: string): string {
  return isUndustMeetLink(link) ? t(LONG_LABEL_KEY, LONG_LABEL_EN) : t(SHORT_LABEL_KEY, SHORT_LABEL_EN);
}

/** Every label a copied line may carry: both variants, here and in English. */
export function meetingLinkLabels(t: TranslateFn): string[] {
  return [t(LONG_LABEL_KEY, LONG_LABEL_EN), t(SHORT_LABEL_KEY, SHORT_LABEL_EN), LONG_LABEL_EN, SHORT_LABEL_EN];
}
