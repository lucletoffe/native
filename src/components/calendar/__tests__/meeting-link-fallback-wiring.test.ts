import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Checked on the source: the suite has no React Native renderer. The rule
// itself is tested in lib/__tests__/meeting-link-fallback.test.ts.
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');
const editor = read('../EventModal.tsx');
const meet = read('../UndustMeetLink.tsx');
const root = path.resolve(__dirname, '../../../..');
const overlay = (code: string) =>
  JSON.parse(fs.readFileSync(path.join(root, 'locales', 'rn', `${code}.json`), 'utf8')).calendar.form;

describe('the meeting link reaches Google Calendar and Outlook guests', () => {
  it('is copied into the location and the description when the undust link is generated', () => {
    const landed = meet.slice(meet.indexOf('await reserveUndustMeet('), meet.indexOf('} catch (err)'));
    expect(landed).toMatch(/setVideoUrl\(room\.url\)/);
    expect(landed).toMatch(/withMeetingLinkFallback\(now, room\.url, meetingLinkLabel\(t\)\)/);
    expect(landed).toMatch(/setLocation\(fields\.location\)/);
    expect(landed).toMatch(/setDescription\(fields\.description\)/);
  });

  it('is guaranteed on save, from the meeting link field, for the organizer only', () => {
    const save = editor.slice(editor.indexOf('const handleSave'), editor.indexOf('const timesMoved'));
    expect(save).toMatch(/organizes\s*\?\s*withMeetingLinkFallback\(\{ location, description \}, videoUrl, meetingLinkLabel\(t\)\)/);
    expect(save).toMatch(/description: places\.description\.trim\(\)/);
    expect(save).toMatch(/buildLocations\(places\.location\)/);
    expect(save).not.toMatch(/buildLocations\(location\)/);
  });

  it('is introduced in English and in French', () => {
    expect(overlay('en').meeting_link_description_label).toBe('Video call (browser, no account or app needed):');
    expect(overlay('fr').meeting_link_description_label).toBe('Visio (navigateur, sans compte ni appli) :');
  });
});
