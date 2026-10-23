import { describe, it, expect } from 'vitest';
import { webmailForSignIn } from '../undust-webmail';

describe('webmailForSignIn', () => {
  it('sends the undust mail server to its webmail', () => {
    expect(webmailForSignIn('https://mail.undust.co')).toBe('https://webmail.undust.co');
    expect(webmailForSignIn('https://MAIL.undust.co/')).toBe('https://webmail.undust.co');
  });

  it('leaves every other server alone', () => {
    expect(webmailForSignIn('https://webmail.undust.co')).toBe('https://webmail.undust.co');
    expect(webmailForSignIn('https://mail.example.com')).toBe('https://mail.example.com');
  });
});
