import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CalendarEvent } from '../../api/types';
import {
  isUndustMailServer,
  organizesEvent,
  reserveUndustMeet,
  shouldOfferUndustMeet,
  undustHostJoinUrl,
  undustMeetRoomOf,
  UNDUST_MEET_RESERVE_URL,
  type UndustMeetAuth,
} from '../undust-meet';

const ROOM_URL = 'https://meet.undust.co/m-0123456789abcdef';

type TestAuth = UndustMeetAuth & { calls: string[] };

function bearerAuth(
  opts: { serverUrl?: string | null; header?: string; usesBearerAuth?: boolean } = {},
): TestAuth {
  const calls: string[] = [];
  return {
    calls,
    serverUrl: opts.serverUrl === undefined ? 'https://mail.undust.co' : opts.serverUrl,
    usesBearerAuth: opts.usesBearerAuth ?? true,
    get authHeader() {
      calls.push('authHeader');
      return opts.header ?? 'Bearer token-1';
    },
    ensureFreshToken: async () => { calls.push('ensureFreshToken'); },
  };
}

function reply(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

describe('isUndustMailServer', () => {
  it.each([
    ['https://mail.undust.co', true],
    ['https://MAIL.undust.co/', true],
    ['https://mail.undust.co:443', false],
    ['https://mail.example.com', false],
    ['https://mail.undust.co.example.com', false],
    ['https://webmail.undust.co', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (serverUrl, expected) => {
    expect(isUndustMailServer(serverUrl)).toBe(expected);
  });
});

describe('undustMeetRoomOf', () => {
  it('reads the room of a guest link', () => {
    expect(undustMeetRoomOf(ROOM_URL)).toBe('m-0123456789abcdef');
    expect(undustMeetRoomOf(`  ${ROOM_URL}/ `)).toBe('m-0123456789abcdef');
    expect(undustMeetRoomOf('https://meet.undust.co/cafe-ia')).toBe('cafe-ia');
  });

  it.each([
    'https://ops.undust.co/meet/m-0123456789abcdef',
    'http://meet.undust.co/m-1',
    'https://meet.jit.si/m-1',
    `${ROOM_URL}?jwt=x`,
    `${ROOM_URL}#config`,
    'https://meet.undust.co/',
    'https://meet.undust.co/-room',
    'https://meet.undust.co/Room',
    'https://meet.undust.co/a/b',
    `https://meet.undust.co/a${'b'.repeat(64)}`,
  ])('refuses %s', (uri) => {
    expect(undustMeetRoomOf(uri)).toBeNull();
  });

  it('refuses no link at all', () => {
    expect(undustMeetRoomOf(undefined)).toBeNull();
  });
});

describe('undustHostJoinUrl', () => {
  it('sends the organizer of an undust meeting in through Ops', () => {
    expect(undustHostJoinUrl(ROOM_URL, { undustAccount: true, organizer: true }))
      .toBe('https://ops.undust.co/meet/m-0123456789abcdef?host=1');
  });

  it('leaves the link alone for a guest, another server or another service', () => {
    expect(undustHostJoinUrl(ROOM_URL, { undustAccount: true, organizer: false })).toBeNull();
    expect(undustHostJoinUrl(ROOM_URL, { undustAccount: false, organizer: true })).toBeNull();
    expect(undustHostJoinUrl('https://zoom.us/j/123', { undustAccount: true, organizer: true })).toBeNull();
    expect(undustHostJoinUrl(undefined, { undustAccount: true, organizer: true })).toBeNull();
  });
});

describe('organizesEvent', () => {
  const me = ['luc@undust.co', 'luc@und.st'];
  const writable = { readOnly: false };

  it('is true for an event of mine with nobody invited', () => {
    expect(organizesEvent({}, me, writable)).toBe(true);
    expect(organizesEvent({ participants: {} }, me, writable)).toBe(true);
  });

  it('is false for an event with nobody invited in a calendar I cannot write', () => {
    expect(organizesEvent({}, me, { readOnly: true })).toBe(false);
  });

  it('is true when one of my addresses owns the event', () => {
    const event: Partial<CalendarEvent> = {
      participants: {
        a: { '@type': 'Participant', email: 'Luc@Und.st', roles: { owner: true, attendee: true } },
        b: { '@type': 'Participant', email: 'client@example.com', roles: { attendee: true } },
      },
    };
    expect(organizesEvent(event, me, writable)).toBe(true);
  });

  it('is false when someone else organizes and I am invited', () => {
    const event: Partial<CalendarEvent> = {
      participants: {
        a: { '@type': 'Participant', email: 'client@example.com', roles: { owner: true } },
        b: { '@type': 'Participant', calendarAddress: 'mailto:luc@undust.co', roles: { attendee: true } },
      },
    };
    expect(organizesEvent(event, me, writable)).toBe(false);
  });
});

describe('shouldOfferUndustMeet', () => {
  const offer = { enabled: true, attendeesBefore: 0, meetingLink: '', alreadyOffered: false };

  it('offers once, on the first guest, while the link is empty', () => {
    expect(shouldOfferUndustMeet(offer)).toBe(true);
    expect(shouldOfferUndustMeet({ ...offer, meetingLink: '   ' })).toBe(true);
  });

  it('stays quiet otherwise', () => {
    expect(shouldOfferUndustMeet({ ...offer, enabled: false })).toBe(false);
    expect(shouldOfferUndustMeet({ ...offer, attendeesBefore: 1 })).toBe(false);
    expect(shouldOfferUndustMeet({ ...offer, meetingLink: 'https://zoom.us/j/1' })).toBe(false);
    expect(shouldOfferUndustMeet({ ...offer, alreadyOffered: true })).toBe(false);
  });
});

describe('reserveUndustMeet', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reserves with the fresh Bearer token and returns the guest link', async () => {
    const auth = bearerAuth();
    const fetchMock = vi.fn().mockResolvedValue(reply(201, {
      url: ROOM_URL,
      host_url: 'https://ops.undust.co/meet/m-0123456789abcdef?host=1',
      room_name: 'm-0123456789abcdef',
      organizer_email: 'luc@undust.co',
    }));

    const room = await reserveUndustMeet(auth, '  Appel Thomas  ', fetchMock);

    expect(room).toEqual({ url: ROOM_URL, roomName: 'm-0123456789abcdef' });
    expect(auth.calls).toEqual(['ensureFreshToken', 'authHeader']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UNDUST_MEET_RESERVE_URL);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer token-1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Appel Thomas' }),
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves the subject out when the title is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(201, { url: ROOM_URL }));
    await reserveUndustMeet(bearerAuth(), '   ', fetchMock);
    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
  });

  it('never sends anything for a password account', async () => {
    const fetchMock = vi.fn();
    const auth = bearerAuth({ usesBearerAuth: false, header: 'Basic dXNlcjpwYXNz' });
    await expect(reserveUndustMeet(auth, 'x', fetchMock)).rejects.toMatchObject({ reason: 'oauth_required' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.calls).not.toContain('authHeader');
  });

  it('never sends a Basic header, whatever the client claims', async () => {
    const fetchMock = vi.fn();
    const auth = bearerAuth({ header: 'Basic dXNlcjpwYXNz' });
    await expect(reserveUndustMeet(auth, 'x', fetchMock)).rejects.toMatchObject({ reason: 'oauth_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://mail.example.com',
    'https://mail.undust.co.example.com',
    null,
  ])('never sends a token of another server (%s)', async (serverUrl) => {
    const fetchMock = vi.fn();
    const auth = bearerAuth({ serverUrl });
    await expect(reserveUndustMeet(auth, 'x', fetchMock)).rejects.toMatchObject({ reason: 'not_undust_server' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.calls).toEqual(['ensureFreshToken']);
  });

  it.each([
    ['the Ops link of the v1 server', { url: 'https://ops.undust.co/meet/m-0123456789abcdef' }],
    ['no link', { room_name: 'm-1' }],
    ['no JSON', '<html></html>'],
  ])('refuses an answer with %s', async (_label, body) => {
    const fetchMock = vi.fn().mockResolvedValue(reply(201, body));
    await expect(reserveUndustMeet(bearerAuth(), 'x', fetchMock)).rejects.toMatchObject({ reason: 'invalid_response' });
  });

  it.each([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [401, { error: 'bearer_required' }, 'oauth_required'],
    [403, { error: 'forbidden' }, 'forbidden'],
    [429, { error: 'rate_limited' }, 'rate_limited'],
    [503, { error: 'identity_unavailable' }, 'unavailable'],
    [422, { error: 'invalid' }, 'http'],
    [500, 'Internal Server Error', 'http'],
    [502, '<html>Bad gateway</html>', 'http'],
  ])('reports HTTP %i %j as %s', async (status, body, reason) => {
    const fetchMock = vi.fn().mockResolvedValue(reply(status, body));
    await expect(reserveUndustMeet(bearerAuth(), 'x', fetchMock)).rejects.toMatchObject({ reason, status });
  });

  it('reports a request that never got an answer as a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(reserveUndustMeet(bearerAuth(), 'x', fetchMock)).rejects.toMatchObject({
      name: 'UndustMeetError',
      reason: 'network',
      status: 0,
    });
  });

  it('gives up on a server that does not answer within 15 s', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => abortRejection(init.signal as AbortSignal));
    const pending = reserveUndustMeet(bearerAuth(), 'x', fetchMock as unknown as typeof fetch);
    const outcome = expect(pending).rejects.toMatchObject({ reason: 'network' });
    await vi.advanceTimersByTimeAsync(15_000);
    await outcome;
  });

  it('gives up on an answer whose body never ends', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 201,
      json: () => abortRejection(init.signal as AbortSignal),
    }));
    const pending = reserveUndustMeet(bearerAuth(), 'x', fetchMock as unknown as typeof fetch);
    const outcome = expect(pending).rejects.toMatchObject({ reason: 'network' });
    await vi.advanceTimersByTimeAsync(15_000);
    await outcome;
  });
});
