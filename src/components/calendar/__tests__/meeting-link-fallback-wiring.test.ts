import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Checked on the source: the suite has no React Native renderer. The rule
// itself is tested in lib/__tests__/meeting-link-fallback.test.ts.
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');
const editor = read('../EventModal.tsx');
const meet = read('../UndustMeetLink.tsx');
const sheet = read('../EventDetailSheet.tsx');
const root = path.resolve(__dirname, '../../../..');
const overlay = (code: string) =>
  JSON.parse(fs.readFileSync(path.join(root, 'locales', 'rn', `${code}.json`), 'utf8')).calendar.form;

describe('the meeting link reaches Google Calendar and Outlook guests', () => {
  it('is copied into the location and the description when the undust link is generated, replacing an earlier one', () => {
    const landed = meet.slice(meet.indexOf('await reserveUndustMeet('), meet.indexOf('} catch (err)'));
    expect(landed).toMatch(/setVideoUrl\(room\.url\)/);
    expect(landed).toMatch(/withMeetingLinkFallback\(now, room\.url, meetingLinkLabel\(t, room\.url\), \{\s*previousLinks: previousLinks\(\),\s*knownLabels: meetingLinkLabels\(t\)/);
    expect(landed).toMatch(/copied\.current\.push\(room\.url\)/);
    expect(landed).toMatch(/setLocation\(fields\.location\)/);
    expect(landed).toMatch(/setDescription\(fields\.description\)/);
    expect(meet).toMatch(/const previousLinks = \(\) => \[latest\.current\.initialLink, \.\.\.copied\.current\]/);
  });

  it('offers no undust link on someone else\u2019s invitation', () => {
    expect(meet).toMatch(/const enabled = isUndustMailServer\([^;]*\) && form\.organizes;/);
    expect(editor).toMatch(/initialLink: initialVideoUrl, organizes,/);
  });

  it('is guaranteed on save for the organizer, and only when the save changes something', () => {
    const save = editor.slice(editor.indexOf('const handleSave'), editor.indexOf('const timesMoved'));
    expect(save).toMatch(/const previousLinks = undustMeet\.previousLinks\(\);/);
    expect(save).toMatch(/shouldCopyMeetingLink\(\{\s*organizes, existing: isEdit, link: videoUrl, initialLink: initialVideoUrl, previousLinks, formChanged: dirty,\s*\}\)/);
    expect(save).toMatch(/withMeetingLinkFallback\(\{ location, description \}, videoUrl, meetingLinkLabel\(t, videoUrl\), \{\s*previousLinks,\s*knownLabels: meetingLinkLabels\(t\)/);
    expect(save).toMatch(/description: places\.description\.trim\(\)/);
    expect(save).toMatch(/buildLocations\(places\.location\)/);
    expect(save).not.toMatch(/buildLocations\(location\)/);
    expect(editor).toMatch(/const initialVideoUrl = detectVideoUrl\(event\);/);
  });

  it('joins as organizer when the organizer taps a location holding the meeting link', () => {
    const open = sheet.slice(sheet.indexOf('const openLocation'), sheet.indexOf('const copyTitle'));
    expect(open).toMatch(/action\.kind === 'url' && hostJoinUri && action\.uri === videoUri\) \{\s*void openExternalUrl\(hostJoinUri\);/);
  });

  it('is introduced in English and in French', () => {
    expect(overlay('en').meeting_link_description_label).toBe('Video call (browser, no account or app needed):');
    expect(overlay('fr').meeting_link_description_label).toBe('Visio (navigateur, sans compte ni appli) :');
    expect(overlay('en').meeting_link_description_label_other).toBe('Video call:');
    expect(overlay('fr').meeting_link_description_label_other).toBe('Visio :');
  });
});
