// undust fork only: an undust video room for a calendar event, and the
// organizer's way into it. Contract: decision GNgpgt03 (PG fractal), server
// side `POST /api/calendar/meetings/reserve` on ops.undust.co (fractal--nexus,
// Api::Calendar::MeetingReservationsController).
//
// - The event carries `https://meet.undust.co/<room>`: the link every guest
//   receives in the invitation.
// - The organizer joins through `https://ops.undust.co/meet/<room>?host=1`,
//   where Ops signs them in (Pocket ID) and lets them in as moderator.
// - The app reserves with its JMAP Bearer token; Ops resolves who it belongs
//   to against the undust mail server. A Basic header carries the password
//   and is never sent: a password account gets an explanation, no request.

import type { CalendarEvent } from '../api/types';
import { isOrganizer } from './calendar-participants';
import { hostOf } from './open-url';

export const UNDUST_MEET_RESERVE_URL = 'https://ops.undust.co/api/calendar/meetings/reserve';

// The token is only good for the undust mail server: the feature exists for
// an account signed in there and nowhere else, whatever its address.
const UNDUST_MAIL_HOST = 'mail.undust.co';

const ROOM_LINK_RE = /^https:\/\/meet\.undust\.co\/([a-z0-9][a-z0-9-]{0,63})\/?$/;

const RESERVE_TIMEOUT_MS = 15_000;

export function isUndustMailServer(serverUrl: string | null | undefined): boolean {
  return !!serverUrl && hostOf(serverUrl).toLowerCase() === UNDUST_MAIL_HOST;
}

/** The room of a `https://meet.undust.co/<room>` link, null for any other link. */
export function undustMeetRoomOf(uri: string | null | undefined): string | null {
  const m = ROOM_LINK_RE.exec((uri ?? '').trim());
  return m ? m[1] : null;
}

/** The user organizes the event: their address owns it, or nobody is invited. */
export function organizesEvent(event: Partial<CalendarEvent>, userEmails: string[]): boolean {
  return Object.keys(event.participants ?? {}).length === 0 || isOrganizer(event, userEmails);
}

/**
 * Where the organizer joins their own undust meeting, or null when the
 * meeting link should open as it is (another service, someone else's event,
 * another server).
 */
export function undustHostJoinUrl(
  meetingUri: string | null | undefined,
  opts: { undustAccount: boolean; organizer: boolean },
): string | null {
  if (!opts.undustAccount || !opts.organizer) return null;
  const room = undustMeetRoomOf(meetingUri);
  return room ? `https://ops.undust.co/meet/${room}?host=1` : null;
}

/**
 * The editor offers the link once per opening, when the first guest is added
 * and the meeting link field is still empty.
 */
export function shouldOfferUndustMeet(state: {
  enabled: boolean;
  attendeesBefore: number;
  meetingLink: string;
  alreadyOffered: boolean;
}): boolean {
  return state.enabled
    && state.attendeesBefore === 0
    && !state.meetingLink.trim()
    && !state.alreadyOffered;
}

export type UndustMeetFailure =
  | 'oauth_required'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'invalid_response'
  | 'http';

export class UndustMeetError extends Error {
  readonly reason: UndustMeetFailure;
  readonly status: number;
  constructor(reason: UndustMeetFailure, status = 0) {
    super(status ? `${reason} (${status})` : reason);
    this.name = 'UndustMeetError';
    this.reason = reason;
    this.status = status;
  }
}

/** What the reservation needs from the JMAP client (`jmapClient` fits). */
export interface UndustMeetAuth {
  readonly usesBearerAuth: boolean;
  readonly authHeader: string;
  ensureFreshToken(): Promise<void>;
}

export interface ReservedUndustMeet {
  url: string;
  roomName: string;
}

function failureOf(status: number, error: unknown): UndustMeetFailure {
  if (status === 401) return error === 'bearer_required' ? 'oauth_required' : 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'http';
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function reserveUndustMeet(
  auth: UndustMeetAuth,
  subject: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReservedUndustMeet> {
  if (!auth.usesBearerAuth) throw new UndustMeetError('oauth_required');
  await auth.ensureFreshToken();
  const authorization = auth.authHeader;
  // Belt and braces: whatever the client state says, a password never leaves.
  if (!authorization.startsWith('Bearer ')) throw new UndustMeetError('oauth_required');

  const trimmed = subject.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESERVE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(UNDUST_MEET_RESERVE_URL, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(trimmed ? { subject: trimmed } : {}),
      signal: controller.signal,
    });
  } catch {
    throw new UndustMeetError('network');
  } finally {
    clearTimeout(timer);
  }

  const body = await jsonOf(res);
  if (!res.ok) throw new UndustMeetError(failureOf(res.status, body.error), res.status);

  // The link goes into the invitation as is: only a guest room link will do.
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const roomName = undustMeetRoomOf(url);
  if (!roomName) throw new UndustMeetError('invalid_response', res.status);
  return { url, roomName };
}
