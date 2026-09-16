import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MatchPickRow } from '@/components/match/MatchPickRow';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { attachableFixtures, attachMatchId, fixtureScoreLabel } from '@/lib/matchSocial';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { scheduleDemoNotification } from '@/services/notifications';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function ComposeScreen() {
  const catalog = useFootballCatalog();
  const { addPost, currentUser } = useApp();
  const params = useLocalSearchParams<{ matchId?: string }>();
  const preset = typeof params.matchId === 'string' ? params.matchId : undefined;
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [matchId, setMatchId] = useState<string | undefined>(preset);
  const [pickerOpen, setPickerOpen] = useState(!preset);

  const options = useMemo(
    () => attachableFixtures(football),
    [catalog.lastSyncedAt, catalog.ready, catalog.source],
  );
  const selected = matchId ? football.getFixture(attachMatchId(football, matchId)) : undefined;

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled) setImageUri(res.assets[0]?.uri);
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title="New post"
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/' as Href);
          }}
        />
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
              ? 'Live, today, and upcoming England fixtures from the scores provider.'
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
              addPost(text.trim(), imageUri, attached);
              scheduleDemoNotification(
                'KickFeed',
                attached && selected
                  ? `Posted on ${fixtureScoreLabel(football, selected)}.`
                  : 'Your post is live in the demo feed.',
              );
              if (attached) {
                router.replace(`/match/${attached}?tab=chat` as Href);
              } else if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/' as Href);
              }
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
