import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isUndustMeetLink, meetingLinkLabel, withMeetingLinkFallback } from '../meeting-link-fallback';

/**
 * Guests on Google Calendar or Outlook see neither the meeting link field
 * (CONFERENCE) nor a join button: the link must reach them through the
 * location and the description.
 */

const LINK = 'https://meet.undust.co/m-0123456789abcdef';
const LABEL = 'Visio (navigateur, sans compte ni appli) :';
const LINE = `${LABEL} ${LINK}`;

describe('withMeetingLinkFallback', () => {
  it('fills an empty location and an empty description with the link', () => {
    expect(withMeetingLinkFallback({ location: '', description: '' }, LINK, LABEL)).toEqual({
      location: LINK,
      description: LINE,
    });
  });

  it('never replaces a location the user typed', () => {
    const out = withMeetingLinkFallback({ location: '12 rue des Lilas, Lyon', description: '' }, LINK, LABEL);
    expect(out.location).toBe('12 rue des Lilas, Lyon');
    expect(out.description).toBe(LINE);
  });

  it('treats a location of blanks as empty', () => {
    expect(withMeetingLinkFallback({ location: '   ', description: '' }, LINK, LABEL).location).toBe(LINK);
  });

  it('adds the link after a blank line, below the notes', () => {
    const out = withMeetingLinkFallback({ location: '', description: 'Ordre du jour : budget 2027\n\n' }, LINK, LABEL);
    expect(out.description).toBe(`Ordre du jour : budget 2027\n\n${LINE}`);
  });

  it('leaves a description that already holds the link as it is', () => {
    const description = `Rejoindre ici : ${LINK} (salle ouverte 5 min avant)`;
    expect(withMeetingLinkFallback({ location: '', description }, LINK, LABEL).description).toBe(description);
  });

  it('changes nothing without a link', () => {
    const fields = { location: '', description: 'Notes' };
    expect(withMeetingLinkFallback(fields, '', LABEL)).toBe(fields);
    expect(withMeetingLinkFallback(fields, '  ', LABEL)).toBe(fields);
    expect(withMeetingLinkFallback(fields, null, LABEL)).toBe(fields);
    expect(withMeetingLinkFallback(fields, undefined, LABEL)).toBe(fields);
  });

  it('trims the link before writing it', () => {
    expect(withMeetingLinkFallback({ location: '', description: '' }, `  ${LINK}\n`, LABEL)).toEqual({
      location: LINK,
      description: LINE,
    });
  });

  it('is idempotent: a second pass adds nothing', () => {
    const once = withMeetingLinkFallback({ location: '', description: 'Notes' }, LINK, LABEL);
    expect(withMeetingLinkFallback(once, LINK, LABEL)).toEqual(once);
  });

  it('adds a link pasted by hand, whatever the service', () => {
    const zoom = 'https://us02web.zoom.us/j/123456789';
    expect(withMeetingLinkFallback({ location: '', description: '' }, zoom, LABEL)).toEqual({
      location: zoom,
      description: `${LABEL} ${zoom}`,
    });
  });

  it('leaves an HTML description alone, but still fills the location', () => {
    const description = '<p>Ordre du jour</p><ul><li>budget</li></ul>';
    expect(withMeetingLinkFallback({ location: '', description }, LINK, LABEL)).toEqual({
      location: LINK,
      description,
    });
  });

  it('still adds the link below a plain-text Outlook description with <https://…> links', () => {
    const description = 'En savoir plus<https://aka.ms/JoinTeamsMeeting>';
    expect(withMeetingLinkFallback({ location: '', description }, LINK, LABEL).description).toBe(
      `${description}\n\n${LINE}`,
    );
  });
});

describe('isUndustMeetLink', () => {
  it('recognises an undust room', () => {
    expect(isUndustMeetLink(LINK)).toBe(true);
    expect(isUndustMeetLink(`  ${LINK}\n`)).toBe(true);
  });

  it('refuses a host that only contains meet.undust.co', () => {
    expect(isUndustMeetLink('https://meet.undust.co.evil.example/m-0123')).toBe(false);
    expect(isUndustMeetLink('https://evil.example/meet.undust.co/m-0123')).toBe(false);
    expect(isUndustMeetLink('https://xmeet.undust.co/m-0123')).toBe(false);
  });

  it('refuses plain http, other services and anything that is not a URL', () => {
    expect(isUndustMeetLink('http://meet.undust.co/m-0123')).toBe(false);
    expect(isUndustMeetLink('https://us02web.zoom.us/j/123456789')).toBe(false);
    expect(isUndustMeetLink('meet.undust.co/m-0123')).toBe(false);
    expect(isUndustMeetLink('')).toBe(false);
    expect(isUndustMeetLink(null)).toBe(false);
    expect(isUndustMeetLink(undefined)).toBe(false);
  });
});

describe('meetingLinkLabel', () => {
  // The French overlay, as the app reads it.
  const fr = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../locales/rn/fr.json'), 'utf8'),
  ).calendar.form as Record<string, string>;
  const t = (key: string, fallback?: string) => fr[key.replace('calendar.form.', '')] ?? fallback ?? key;

  it('promises no account or app for an undust room', () => {
    expect(meetingLinkLabel(t, LINK)).toBe(LABEL);
  });

  it('gives a Zoom link pasted by hand the plain label', () => {
    const zoom = 'https://us02web.zoom.us/j/123456789';
    expect(withMeetingLinkFallback({ location: '', description: '' }, zoom, meetingLinkLabel(t, zoom))).toEqual({
      location: zoom,
      description: `Visio : ${zoom}`,
    });
  });
});
