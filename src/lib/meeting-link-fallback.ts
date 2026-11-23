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
 * Idempotent: applying it twice changes nothing more; a location the user
 * typed is never replaced, and an HTML description is left as it is (a plain
 * text line appended to it would run into its last paragraph).
 */
export interface MeetingLinkFields {
  location: string;
  description: string;
}

export function withMeetingLinkFallback(
  fields: MeetingLinkFields,
  link: string | null | undefined,
  label: string,
): MeetingLinkFields {
  const uri = (link ?? '').trim();
  if (!uri) return fields;

  const location = fields.location.trim() ? fields.location : uri;

  let description = fields.description;
  if (!looksLikeHtml(description) && !description.includes(uri)) {
    const line = `${label.trim()} ${uri}`;
    const body = description.replace(/\s+$/, '');
    description = body ? `${body}\n\n${line}` : line;
  }

  return { location, description };
}

// Elements an HTML description is made of. A plain-text invitation may hold
// `<https://…>` (Outlook writes links so), which this leaves out.
const HTML_TAG = /<\/?(?:p|div|br|span|a|b|i|u|em|strong|ul|ol|li|table|tr|td|h[1-6]|html|body|font)\b[^>]*>/i;

// The app does not read the event's `descriptionContentType` (its
// CalendarEvent/get does not ask for it), so the text itself is looked at.
function looksLikeHtml(description: string): boolean {
  return HTML_TAG.test(description);
}
