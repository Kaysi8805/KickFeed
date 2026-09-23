import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { safeBack } from '@/lib/navBack';

export default function TermsScreen() {
  return <LegalDocumentView kind="terms" onBack={() => safeBack('/')} />;
}
