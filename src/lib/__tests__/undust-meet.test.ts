import { describe, it, expect, vi } from 'vitest';
import {
  isUndustMailServer,
  reserveUndustMeet,
  shouldOfferUndustMeet,
  undustMeetRoomOf,
  UNDUST_MEET_RESERVE_URL,
  type UndustMeetAuth,
} from '../undust-meet';

const ROOM_URL = 'https://meet.undust.co/m-0123456789abcdef';

function bearerAuth(overrides: Partial<UndustMeetAuth> = {}): UndustMeetAuth & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    usesBearerAuth: true,
    get authHeader() {
      calls.push('authHeader');
      return 'Bearer token-1';
    },
    ensureFreshToken: async () => { calls.push('ensureFreshToken'); },
    ...overrides,
  };
}

function reply(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('isUndustMailServer', () => {
  it('is the undust mail server only', () => {
    expect(isUndustMailServer('https://mail.undust.co')).toBe(true);
    expect(isUndustMailServer('https://MAIL.undust.co/')).toBe(true);
    expect(isUndustMailServer('https://mail.example.com')).toBe(false);
    expect(isUndustMailServer('https://mail.undust.co.example.com')).toBe(false);
    expect(isUndustMailServer('https://webmail.undust.co')).toBe(false);
    expect(isUndustMailServer(undefined)).toBe(false);
  });
});

describe('undustMeetRoomOf', () => {
  it('reads the room of a guest link', () => {
    expect(undustMeetRoomOf(ROOM_URL)).toBe('m-0123456789abcdef');
    expect(undustMeetRoomOf(`  ${ROOM_URL}/ `)).toBe('m-0123456789abcdef');
    expect(undustMeetRoomOf('https://meet.undust.co/cafe-ia')).toBe('cafe-ia');
  });

  it('refuses any other link', () => {
    expect(undustMeetRoomOf('https://ops.undust.co/meet/m-0123456789abcdef')).toBeNull();
    expect(undustMeetRoomOf('http://meet.undust.co/m-1')).toBeNull();
    expect(undustMeetRoomOf('https://meet.jit.si/m-1')).toBeNull();
    expect(undustMeetRoomOf(`${ROOM_URL}?jwt=x`)).toBeNull();
    expect(undustMeetRoomOf(`${ROOM_URL}#config`)).toBeNull();
    expect(undustMeetRoomOf('https://meet.undust.co/')).toBeNull();
    expect(undustMeetRoomOf('https://meet.undust.co/-room')).toBeNull();
    expect(undustMeetRoomOf('https://meet.undust.co/Room')).toBeNull();
    expect(undustMeetRoomOf('https://meet.undust.co/a/b')).toBeNull();
    expect(undustMeetRoomOf(`https://meet.undust.co/a${'b'.repeat(64)}`)).toBeNull();
    expect(undustMeetRoomOf(undefined)).toBeNull();
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
    const auth: UndustMeetAuth = {
      usesBearerAuth: false,
      get authHeader(): string { throw new Error('the Basic header must not be read'); },
      ensureFreshToken: async () => {},
    };
    await expect(reserveUndustMeet(auth, 'x', fetchMock)).rejects.toMatchObject({ reason: 'oauth_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends a Basic header, whatever the client claims', async () => {
    const fetchMock = vi.fn();
    const auth = bearerAuth();
    Object.defineProperty(auth, 'authHeader', { get: () => 'Basic dXNlcjpwYXNz' });
    await expect(reserveUndustMeet(auth, 'x', fetchMock)).rejects.toMatchObject({ reason: 'oauth_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a link that is not a meet.undust.co room', async () => {
    const v1 = vi.fn().mockResolvedValue(reply(201, { url: 'https://ops.undust.co/meet/m-0123456789abcdef' }));
    await expect(reserveUndustMeet(bearerAuth(), 'x', v1)).rejects.toMatchObject({ reason: 'invalid_response' });
    const empty = vi.fn().mockResolvedValue(reply(201, { room_name: 'm-1' }));
    await expect(reserveUndustMeet(bearerAuth(), 'x', empty)).rejects.toMatchObject({ reason: 'invalid_response' });
    const html = vi.fn().mockResolvedValue(reply(201, '<html></html>'));
    await expect(reserveUndustMeet(bearerAuth(), 'x', html)).rejects.toMatchObject({ reason: 'invalid_response' });
  });

  it.each([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [401, { error: 'bearer_required' }, 'oauth_required'],
    [403, { error: 'forbidden' }, 'forbidden'],
    [429, { error: 'rate_limited' }, 'rate_limited'],
    [503, { error: 'unavailable' }, 'unavailable'],
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
});
