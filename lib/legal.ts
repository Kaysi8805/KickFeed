import legal from '@/content/legal.json';

export type LegalSection = { heading: string; body: string };

export type LegalDocument = {
  title: string;
  sections: LegalSection[];
};

export const LEGAL_UPDATED = legal.updated;
export const PRIVACY_POLICY_URL = legal.privacyPolicyUrl;
export const TERMS_URL = legal.termsUrl;

export const PRIVACY_DOCUMENT: LegalDocument = legal.privacy;
export const TERMS_DOCUMENT: LegalDocument = legal.terms;

export function legalDocument(kind: 'privacy' | 'terms'): LegalDocument {
  return kind === 'privacy' ? PRIVACY_DOCUMENT : TERMS_DOCUMENT;
}
