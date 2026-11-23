import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isUndustMeetLink,
  meetingLinkLabel,
  meetingLinkLabels,
  shouldCopyMeetingLink,
  withMeetingLinkFallback,
} from '../meeting-link-fallback';

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

  it('adds the link to an HTML description as a paragraph of its own, escaped', () => {
    const description = '<p>Ordre du jour</p><ul><li>budget</li></ul>\n';
    const zoom = 'https://zoom.us/j/1?pwd=a&b=c';
    expect(withMeetingLinkFallback({ location: 'Bureau', description }, zoom, 'Visio <web> :')).toEqual({
      location: 'Bureau',
      description: '<p>Ordre du jour</p><ul><li>budget</li></ul><p>Visio &lt;web&gt; : https://zoom.us/j/1?pwd=a&amp;b=c</p>',
    });
  });

  it('adds nothing to an HTML description that already links the room', () => {
    const description = `<p><a href="${LINK}">Rejoindre</a></p>`;
    const once = withMeetingLinkFallback({ location: '', description }, LINK, LABEL);
    expect(once.description).toBe(description);
    expect(withMeetingLinkFallback(once, LINK, LABEL)).toEqual(once);
  });

  it('does not take an address in angle brackets for HTML', () => {
    for (const description of ['Jean <a.dupont@example.com>', 'Contact : <p.martin@ex.fr>']) {
      expect(withMeetingLinkFallback({ location: '', description }, LINK, LABEL).description).toBe(
        `${description}\n\n${LINE}`,
      );
    }
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

  it('reads the host as the join button does, not as React Native\u2019s URL polyfill', () => {
    expect(isUndustMeetLink('https://evil.example/@meet.undust.co/m-1')).toBe(false);
    expect(isUndustMeetLink('https://user@meet.undust.co/m-1')).toBe(false);
    expect(isUndustMeetLink(`${LINK}?jwt=x`)).toBe(false);
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

  it('knows both labels, here and in English', () => {
    expect(meetingLinkLabels(t)).toEqual([
      LABEL,
      'Visio :',
      'Video call (browser, no account or app needed):',
      'Video call:',
    ]);
  });

  it('gives a Zoom link pasted by hand the plain label', () => {
    const zoom = 'https://us02web.zoom.us/j/123456789';
    expect(withMeetingLinkFallback({ location: '', description: '' }, zoom, meetingLinkLabel(t, zoom))).toEqual({
      location: zoom,
      description: `Visio : ${zoom}`,
    });
  });
});

describe('withMeetingLinkFallback with a previous link', () => {
  const OLD = 'https://meet.undust.co/m-old';
  const NEW = 'https://meet.undust.co/m-new';
  const SHORT = 'Visio :';
  const opts = { previousLinks: [OLD], knownLabels: [LABEL, SHORT] };

  it('replaces the copied location and line', () => {
    expect(withMeetingLinkFallback({ location: OLD, description: `Notes\n\n${LABEL} ${OLD}` }, NEW, LABEL, opts)).toEqual({
      location: NEW,
      description: `Notes\n\n${LABEL} ${NEW}`,
    });
  });

  it('replaces a line written with the other label, under the label that fits the new link', () => {
    expect(withMeetingLinkFallback({ location: OLD, description: `${SHORT} ${OLD}` }, NEW, LABEL, opts)).toEqual({
      location: NEW,
      description: `${LABEL} ${NEW}`,
    });
  });

  it('rewrites the old link where the user mentioned it', () => {
    expect(withMeetingLinkFallback({ location: '', description: `Salle : ${OLD} (code 12)` }, NEW, LABEL, opts).description)
      .toBe(`Salle : ${NEW} (code 12)`);
  });

  it('keeps a typed location', () => {
    expect(withMeetingLinkFallback({ location: 'Bureau', description: '' }, NEW, LABEL, opts).location).toBe('Bureau');
  });

  it('takes the copies out when the link is removed', () => {
    expect(withMeetingLinkFallback({ location: OLD, description: `Notes\n\n${LABEL} ${OLD}` }, '', LABEL, opts)).toEqual({
      location: '',
      description: 'Notes',
    });
  });

  it('is idempotent after a replacement', () => {
    const once = withMeetingLinkFallback({ location: OLD, description: `${LABEL} ${OLD}` }, NEW, LABEL, opts);
    expect(withMeetingLinkFallback(once, NEW, LABEL, opts)).toEqual(once);
  });

  it('ignores a previous link equal to the current one', () => {
    const fields = { location: NEW, description: `${LABEL} ${NEW}` };
    expect(withMeetingLinkFallback(fields, NEW, LABEL, { previousLinks: [NEW] })).toEqual(fields);
  });

  it('replaces the paragraph and the links of an HTML description', () => {
    const description = `<p>Notes</p><p>${SHORT} ${OLD}</p><p><a href="${OLD}">salle</a></p>`;
    expect(withMeetingLinkFallback({ location: '', description }, NEW, LABEL, opts).description)
      .toBe(`<p>Notes</p><p><a href="${NEW}">salle</a></p>`);
    expect(withMeetingLinkFallback({ location: OLD, description: `<p>Notes</p><p>${LABEL} ${OLD}</p>` }, '', LABEL, opts))
      .toEqual({ location: '', description: '<p>Notes</p>' });
  });
});

describe('shouldCopyMeetingLink', () => {
  const LINK2 = 'https://meet.undust.co/m-other';
  const base = { organizes: true, existing: true, link: LINK, initialLink: LINK, formChanged: false };

  it('sends nothing for an existing event saved untouched', () => {
    expect(shouldCopyMeetingLink(base)).toBe(false);
  });

  it('copies when the link changed, was removed, or the form changed', () => {
    expect(shouldCopyMeetingLink({ ...base, link: LINK2 })).toBe(true);
    expect(shouldCopyMeetingLink({ ...base, link: '' })).toBe(true);
    expect(shouldCopyMeetingLink({ ...base, initialLink: '' })).toBe(true);
    expect(shouldCopyMeetingLink({ ...base, formChanged: true })).toBe(true);
  });

  it('copies on a new event with a link', () => {
    expect(shouldCopyMeetingLink({ ...base, existing: false, initialLink: '' })).toBe(true);
  });

  it('takes out the copies of a generated link cleared before the save', () => {
    const fresh = { ...base, existing: false, link: '', initialLink: '' };
    expect(shouldCopyMeetingLink(fresh)).toBe(false);
    expect(shouldCopyMeetingLink({ ...fresh, previousLinks: ['', LINK] })).toBe(true);
  });

  it('never touches someone else\u2019s invitation, nor an event without any link', () => {
    expect(shouldCopyMeetingLink({ ...base, organizes: false, link: LINK2, formChanged: true })).toBe(false);
    expect(shouldCopyMeetingLink({ ...base, link: '', initialLink: '', formChanged: true })).toBe(false);
  });
});

describe('withMeetingLinkFallback does not cut into a longer link', () => {
  it('leaves a longer link that starts with the old one', () => {
    const OLD = 'https://zoom.us/j/123';
    const NEW = 'https://zoom.us/j/123?pwd=x';
    expect(withMeetingLinkFallback({ location: '', description: `Rejoindre : ${NEW}` }, NEW, 'Visio :', { previousLinks: [OLD] }).description)
      .toBe(`Rejoindre : ${NEW}`);
    expect(withMeetingLinkFallback({ location: '', description: `Salle ${OLD}2 puis ${OLD} demain` }, 'https://zoom.us/j/9', 'Visio :', { previousLinks: [OLD] }).description)
      .toBe(`Salle ${OLD}2 puis https://zoom.us/j/9 demain`);
  });
});
