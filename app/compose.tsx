import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { scheduleDemoNotification } from '@/services/notifications';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export default function ComposeScreen() {
  const { addPost, currentUser } = useApp();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled) setImageUri(res.assets[0]?.uri);
  }

  return (
    <Screen>
      <HeaderBar title="New post" onBack={() => router.back()} />
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
      <View style={styles.row}>
        <Pressable onPress={pickImage} style={styles.ghost}>
          <Text style={styles.ghostText}>Add photo</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!text.trim()) return;
            addPost(text.trim(), imageUri);
            scheduleDemoNotification('KickFeed', 'Your post is live in the demo feed.');
            router.back();
          }}
          style={[styles.post, !text.trim() && { opacity: 0.4 }]}
        >
          <Text style={styles.postText}>Post</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  as: { ...type.caption, color: colors.textMuted, marginBottom: spacing.md },
  input: {
    minHeight: 140,
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
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, alignItems: 'center' },
  ghost: { padding: 8 },
  ghostText: { ...type.caption, color: colors.limeMuted },
  post: { backgroundColor: colors.lime, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.full },
  postText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});
