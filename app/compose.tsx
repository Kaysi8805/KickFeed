import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MatchPickRow } from '@/components/match/MatchPickRow';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import type { PostAudience } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { attachableFixtures, attachMatchId, fixtureScoreLabel, resolveMatchDeepLink } from '@/lib/matchSocial';
import { routeId } from '@/lib/routeParams';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { scheduleDemoNotification } from '@/services/notifications';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function ComposeScreen() {
  const catalog = useFootballCatalog();
  const { addPost, currentUser } = useApp();
  const params = useLocalSearchParams<{ matchId?: string | string[] }>();
  const preset = routeId(params.matchId);
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [matchId, setMatchId] = useState<string | undefined>(preset);
  const [pickerOpen, setPickerOpen] = useState(!preset);
  const [audience, setAudience] = useState<PostAudience>('friends');

  const options = useMemo(
    () => attachableFixtures(football),
    [catalog.lastSyncedAt, catalog.ready, catalog.source],
  );
  const selected = matchId
    ? resolveMatchDeepLink(football, attachMatchId(football, matchId)).fixture
    : undefined;

  function leaveCompose(attached?: string) {
    if (attached) {
      router.replace(`${entityHref('match', attached)}?tab=chat` as Href);
      return;
    }
    router.replace('/' as Href);
  }

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled) setImageUri(res.assets[0]?.uri);
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="New post" onBack={() => leaveCompose()} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.as}>Posting as {currentUser?.name}</Text>
        <TextInput
          style={styles.input}
          placeholder="What’s happening in football?"
          placeholderTextColor={colors.textDim}
          multiline
          value={text}
          onChangeText={setText}
        />
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" /> : null}

        <View style={styles.audience}>
          <Text style={styles.section}>Audience</Text>
          <Segmented
            value={audience}
            onChange={setAudience}
            options={[
              { key: 'friends', label: 'Friends' },
              { key: 'public', label: 'Public' },
            ]}
          />
          <Text style={styles.hint}>
            {audience === 'friends'
              ? 'Friends only — mutual friends (people who follow you back) can see this on Home.'
              : 'Public — can surface for fans who follow the clubs or leagues in this post.'}
          </Text>
        </View>

        <View style={styles.attach}>
          <View style={styles.attachHead}>
            <Text style={styles.section}>Attach a match</Text>
            {matchId ? (
              <Pressable onPress={() => { setMatchId(undefined); setPickerOpen(true); }}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.hint}>
            {catalog.source === 'live'
              ? 'Live, today, and upcoming fixtures from the live catalog (England, Slovakia, La Liga).'
              : 'Live, today, and upcoming fixtures from the mock catalog.'}
          </Text>
          {selected ? (
            <MatchPickRow
              fixture={selected}
              selected
              onPress={() => setPickerOpen((v) => !v)}
            />
          ) : (
            <Pressable onPress={() => setPickerOpen(true)} style={styles.ghostPick}>
              <Text style={styles.ghostText}>Choose live / today / upcoming</Text>
            </Pressable>
          )}
          {pickerOpen ? (
            options.length === 0 ? (
              <Text style={styles.hint}>No attachable fixtures in this window.</Text>
            ) : (
              options.map((f) => (
                <MatchPickRow
                  key={f.id}
                  fixture={f}
                  selected={matchId === f.id}
                  onPress={() => {
                    setMatchId(f.id);
                    setPickerOpen(false);
                  }}
                />
              ))
            )
          ) : null}
        </View>

        <View style={styles.row}>
          <Pressable onPress={pickImage} style={styles.ghost}>
            <Text style={styles.ghostText}>Add photo</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!text.trim()) return;
              const attached = matchId ? attachMatchId(football, matchId) : undefined;
              addPost(text.trim(), imageUri, attached, audience);
              scheduleDemoNotification(
                'KickFeed',
                attached && selected
                  ? `Posted on ${fixtureScoreLabel(football, selected)}.`
                  : 'Your post is live in the demo feed.',
              );
              leaveCompose(attached);
            }}
            style={[styles.post, !text.trim() && { opacity: 0.4 }]}
          >
            <Text style={styles.postText}>Post</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  as: { ...type.caption, color: colors.textMuted, marginBottom: spacing.md },
  input: {
    minHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
    ...type.body,
  },
  preview: {
    height: 160,
    width: '100%',
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  audience: { marginTop: spacing.lg, gap: spacing.sm },
  attach: { marginTop: spacing.lg },
  attachHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { ...type.micro, color: colors.textMuted },
  clear: { ...type.caption, color: colors.lime },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginVertical: spacing.sm, lineHeight: 18 },
  ghostPick: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, alignItems: 'center' },
  ghost: { padding: 8 },
  ghostText: { ...type.caption, color: colors.limeMuted },
  post: { backgroundColor: colors.lime, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.full },
  postText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});
