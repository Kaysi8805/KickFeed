import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export default function EditProfileScreen() {
  const { currentUser, updateProfile } = useApp();
  const [name, setName] = useState(currentUser?.name ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');

  return (
    <Screen>
      <HeaderBar title="Edit profile" onBack={() => router.back()} />
      <Text style={styles.label}>Display name</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.textDim} />
      <Text style={styles.label}>Bio</Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
        multiline
        placeholderTextColor={colors.textDim}
      />
      <Pressable
        style={styles.save}
        onPress={() => {
          updateProfile({ name: name.trim() || currentUser?.name, bio: bio.trim() });
          router.back();
        }}
      >
        <Text style={styles.saveText}>Save</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...type.micro, color: colors.textMuted, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  save: {
    marginTop: spacing.xl,
    backgroundColor: colors.lime,
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.lg,
  },
  saveText: { ...type.subtitle, color: colors.bg },
});
