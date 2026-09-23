import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { safeBack } from '@/lib/navBack';

export default function PrivacyScreen() {
  return <LegalDocumentView kind="privacy" onBack={() => safeBack('/')} />;
}
