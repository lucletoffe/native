// undust fork only: the event editor's undust video link (decision GNgpgt03).
// Kept out of EventModal so the upstream editor stays a few lines away from
// its own code on every rebase.

import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Video } from '../icons';
import { Button } from '..';
import { jmapClient } from '../../api/jmap-client';
import { useAccountStore } from '../../stores/account-store';
import type { TranslateFn } from '../../stores/locale-store';
import { useCalendarLocale } from '../../lib/calendar-locale';
import { radius, spacing, typography, type ThemePalette } from '../../theme/tokens';
import { useColors } from '../../theme/colors';
import {
  isUndustMailServer,
  reserveUndustMeet,
  shouldOfferUndustMeet,
  UndustMeetError,
  type UndustMeetFailure,
} from '../../lib/undust-meet';

interface EditorForm {
  /** Changes when the editor opens or moves to another event. */
  formKey: string | null;
  title: string;
  videoUrl: string;
  setVideoUrl: React.Dispatch<React.SetStateAction<string>>;
  attendeeCount: number;
}

export interface UndustMeetLink {
  showButton: boolean;
  showPrompt: boolean;
  generating: boolean;
  generate: () => void;
  dismissPrompt: () => void;
  /** Call before adding a guest: the first one brings the offer. */
  attendeeAdded: () => void;
}

function failureMessage(err: unknown, t: TranslateFn): string {
  const reason: UndustMeetFailure = err instanceof UndustMeetError ? err.reason : 'http';
  switch (reason) {
    case 'oauth_required':
      return t('calendar.form.undust_meet_error_oauth', 'An undust video link needs a token sign-in, not a password. Sign out of this account, then sign in again on your provider\'s page (Pocket ID) or with a sign-in code.');
    case 'not_undust_server':
      return t('calendar.form.undust_meet_error_server', 'Undust video links are only for accounts on mail.undust.co.');
    case 'unauthorized':
      return t('calendar.form.undust_meet_error_401', 'Ops did not accept this session. Sign in to Bulwark again.');
    case 'forbidden':
      return t('calendar.form.undust_meet_error_403', 'This account may not create undust video rooms.');
    case 'rate_limited':
      return t('calendar.form.undust_meet_error_429', 'Too many requests. Try again in a minute.');
    case 'unavailable':
      return t('calendar.form.undust_meet_error_503', 'The undust video service is unavailable. Try again later.');
    case 'network':
      return t('calendar.form.undust_meet_error_network', 'Could not reach ops.undust.co. Check the connection and try again.');
    case 'invalid_response':
      return t('calendar.form.undust_meet_error_response', 'Ops did not answer with a meet.undust.co link.');
    case 'http':
      return t('calendar.form.undust_meet_error', 'The undust video link could not be created (code {code}).', {
        code: String(err instanceof UndustMeetError ? err.status : 0),
      });
  }
}

/**
 * The link is written into the form, so the event is saved with it and the
 * guests' first invitation already carries it. Saving never waits for it.
 */
export function useUndustMeetLink(form: EditorForm): UndustMeetLink {
  const { t } = useCalendarLocale();
  const enabled = isUndustMailServer(useAccountStore((s) => s.getActiveAccount()?.serverUrl));
  const [generating, setGenerating] = React.useState(false);
  const [promptVisible, setPromptVisible] = React.useState(false);
  const [offered, setOffered] = React.useState(false);
  // A ref, not the state above: two quick taps both run before the
  // `generating` re-render lands, and would reserve two rooms.
  const inFlight = React.useRef(false);
  // A reservation that lands after the editor closed or moved to another
  // event must not touch that form.
  const session = React.useRef(0);

  React.useEffect(() => {
    session.current += 1;
    inFlight.current = false;
    setGenerating(false);
    setPromptVisible(false);
    setOffered(false);
  }, [form.formKey]);

  const linkEmpty = !form.videoUrl.trim();

  const generate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const mine = session.current;
    setPromptVisible(false);
    setGenerating(true);
    try {
      const room = await reserveUndustMeet(jmapClient, form.title);
      // A link typed in the meantime wins over the generated one.
      if (mine === session.current) form.setVideoUrl((typed) => (typed.trim() ? typed : room.url));
    } catch (err) {
      if (mine === session.current) {
        Alert.alert(t('calendar.form.undust_meet_error_title', 'No undust video link'), failureMessage(err, t));
      }
    } finally {
      if (mine === session.current) {
        inFlight.current = false;
        setGenerating(false);
      }
    }
  };

  return {
    showButton: enabled && linkEmpty,
    showPrompt: promptVisible && form.attendeeCount > 0 && linkEmpty,
    generating,
    generate: () => { void generate(); },
    dismissPrompt: () => setPromptVisible(false),
    attendeeAdded: () => {
      if (shouldOfferUndustMeet({
        enabled,
        attendeesBefore: form.attendeeCount,
        meetingLink: form.videoUrl,
        alreadyOffered: offered,
      })) {
        setOffered(true);
        setPromptVisible(true);
      }
    },
  };
}

export function UndustMeetButton({ meet }: { meet: UndustMeetLink }) {
  const c = useColors();
  const { t } = useCalendarLocale();
  if (!meet.showButton) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Video size={16} color={c.text} />}
      onPress={meet.generate}
      disabled={meet.generating}
      style={{ alignSelf: 'flex-start' }}
    >
      {meet.generating
        ? t('calendar.form.undust_meet_generating', 'Creating the link…')
        : t('calendar.form.undust_meet_generate', 'Generate an undust video link')}
    </Button>
  );
}

export function UndustMeetPrompt({ meet }: { meet: UndustMeetLink }) {
  const c = useColors();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const { t } = useCalendarLocale();
  if (!meet.showPrompt) return null;
  return (
    <View style={styles.prompt}>
      <View style={styles.question}>
        <Video size={16} color={c.textMuted} />
        <Text style={styles.questionText}>
          {t('calendar.form.undust_meet_prompt', 'Add an undust video link?')}
        </Text>
      </View>
      <View style={styles.answers}>
        <Button size="sm" onPress={meet.generate} disabled={meet.generating}>
          {t('calendar.form.undust_meet_prompt_yes', 'Yes')}
        </Button>
        <Button variant="ghost" size="sm" onPress={meet.dismissPrompt}>
          {t('calendar.form.undust_meet_prompt_no', 'No')}
        </Button>
      </View>
    </View>
  );
}

function makeStyles(c: ThemePalette) {
  return StyleSheet.create({
    prompt: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    question: { flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    questionText: { flex: 1, ...typography.body, color: c.text },
    answers: { flexDirection: 'row', gap: spacing.xs },
  });
}
