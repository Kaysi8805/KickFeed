import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { LEGAL_UPDATED, legalDocument } from '@/lib/legal';
import { colors, spacing, type } from '@/theme';

export function LegalDocumentView({
  kind,
  onBack,
}: {
  kind: 'privacy' | 'terms';
  onBack: () => void;
}) {
  const doc = legalDocument(kind);
  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={doc.title} onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Updated {LEGAL_UPDATED}</Text>
        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  updated: { ...type.caption, color: colors.textDim, fontWeight: '500', marginBottom: spacing.md },
  section: { marginBottom: spacing.lg },
  heading: { ...type.subtitle, color: colors.text, marginBottom: 6 },
  body: { ...type.body, color: colors.textMuted, lineHeight: 22 },
});
