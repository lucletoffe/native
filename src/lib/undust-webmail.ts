// undust fork only: mail.undust.co serves JMAP, while the Bulwark webmail that
// signs people in (Pocket ID) lives at webmail.undust.co. Discovery finds the
// JMAP host; a hand-off opened there lands on Stalwart's own sign-in page,
// which offers no Pocket ID and refuses passwords under the OIDC directory.

import { isUndustMailServer } from './undust-meet';

export const UNDUST_WEBMAIL_URL = 'https://webmail.undust.co';

/** Where to open the sign-in hand-off for `serverUrl`. */
export function webmailForSignIn(serverUrl: string): string {
  return isUndustMailServer(serverUrl) ? UNDUST_WEBMAIL_URL : serverUrl;
}
