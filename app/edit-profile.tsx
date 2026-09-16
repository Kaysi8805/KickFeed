import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { CountryChips } from '@/components/tv/ChannelChips';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { resolveTvCountryId } from '@/lib/tvCountry';
import { useApp } from '@/services/AppProvider';
import { tv } from '@/services/tv';
import { colors, radius, spacing, type } from '@/theme';

export default function EditProfileScreen() {
  const { currentUser, updateProfile } = useApp();
  const [name, setName] = useState(currentUser?.name ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [tvCountryId, setTvCountryId] = useState(() => resolveTvCountryId(currentUser?.tvCountryId));
  const countries = tv.getCountries();
  const country = tv.getCountry(tvCountryId);

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
      <Text style={styles.label}>TV country</Text>
      <CountryChips countries={countries} value={tvCountryId} onChange={setTvCountryId} />
      <Text style={styles.hint}>
        Channels on match pages and the TV schedule default to {country ? `${country.flag} ${country.name}` : 'this geo'}.
        Device locale is used until you save one (Slovakia if the locale isn’t a launch geo).
      </Text>
      <Pressable
        style={styles.save}
        onPress={() => {
          updateProfile({
            name: name.trim() || currentUser?.name,
            bio: bio.trim(),
            tvCountryId,
          });
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
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: spacing.sm, lineHeight: 18 },
  save: {
    marginTop: spacing.xl,
    backgroundColor: colors.lime,
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.lg,
  },
  saveText: { ...type.subtitle, color: colors.bg },
});
