import { router } from 'expo-router';
import { Text, TextStyle } from 'react-native';

import { splitEntityText } from '@/lib/entityText';
import { entityHref } from '@/lib/entityNav';
import { colors } from '@/theme';

export function EntityText({ text, style }: { text: string; style?: TextStyle }) {
  const parts = splitEntityText(text);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.kind === 'text' ? (
          <Text key={i}>{part.value}</Text>
        ) : (
          <Text
            key={i}
            style={{ color: colors.lime }}
            onPress={() => router.push(entityHref(part.kind, part.id))}
          >
            {part.value}
          </Text>
        ),
      )}
    </Text>
  );
}
