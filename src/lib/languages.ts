// Languages a client can receive updates in. English and Kannada have fixed templates (src/lib/messages.ts);
// every language can be drafted by the AI from confirmed case facts (src/lib/ai/services/client-update.ts).
// To add one: append it here and add its code to the Prisma enum `Language` (uppercase) with a migration.

export const LANGUAGES = [
  { code: "en", name: "English", native: "English", rtl: false },
  { code: "hi", name: "Hindi", native: "हिन्दी", rtl: false },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", rtl: false },
  { code: "ta", name: "Tamil", native: "தமிழ்", rtl: false },
  { code: "te", name: "Telugu", native: "తెలుగు", rtl: false },
  { code: "ml", name: "Malayalam", native: "മലയാളം", rtl: false },
  { code: "mr", name: "Marathi", native: "मराठी", rtl: false },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", rtl: false },
  { code: "bn", name: "Bengali", native: "বাংলা", rtl: false },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", rtl: false },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", rtl: false },
  { code: "as", name: "Assamese", native: "অসমীয়া", rtl: false },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
  { code: "kok", name: "Konkani", native: "कोंकणी", rtl: false },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];
export const LANG_CODES = LANGUAGES.map((l) => l.code) as [LangCode, ...LangCode[]];
/** Languages with a fixed, reviewed template; others need the AI. */
export const TEMPLATE_LANGS: readonly LangCode[] = ["en", "kn"];

export const language = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
/** "Tamil · தமிழ்" (or just "English"). */
export const languageLabel = (code: string) => {
  const l = language(code);
  return l.native === l.name ? l.name : `${l.name} · ${l.native}`;
};

// Digits in Indian scripts and Arabic-Indic (Urdu), mapped to 0-9, so dates can be checked in any language.
const DIGIT_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0660, 0x06f0];
export function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9)!;
    return String(cp - zero);
  });
}
