// The dictionary of default field values, one entry per locale. Closed set, no
// network: these are the phrases that repeat across every creative, and a
// machine translation drifting on a compliance line is a worse outcome than a
// missing language.
//
// What the user types over the top of this is an Override and lives on the
// model; this file is only ever read.
import type { FieldValue, LocaleId } from './types.ts';

/** Until locales are a list the user edits, everything is built in this one. */
export const DEFAULT_LOCALE: LocaleId = 'en';

export const FLAGS: Record<LocaleId, string> = {
  en: '🇬🇧', de: '🇩🇪', it: '🇮🇹', es: '🇪🇸', fr: '🇫🇷', nl: '🇳🇱', pl: '🇵🇱',
};

type Phrases = Readonly<Record<string, FieldValue>>;

/**
 * Numbers and clock times, which are the same sentence in every language. Kept
 * apart so that adding a locale is writing prose, not re-typing a rate.
 */
const SHARED: Phrases = {
  rate: '18–24',
  cur: '€',
  shifts: ['07:00–15:00', '15:00–23:00', '23:00–07:00'],
  // The rates banner is a column of figures; only the words around it translate.
  // In the currency the rest of the book quotes: the geos are the same seven.
  rates: ['200 – 300 €', '500 – 800 €', '900 – 1200 €'],
};

const BY_LOCALE: Record<LocaleId, Phrases> = {
  en: {
    eyebrow: 'PART-TIME',
    headline: 'Airport staff wanted',
    age: '18–65+ years',
    audience: 'Students • Retirees • Parents',
    unitTop: 'net',
    unitBot: 'per hour',
    jobsLabel: 'VACANCIES',
    jobs: ['Ground staff', 'Baggage handling', 'Cleaning', 'Security', 'Check-in', 'Catering', 'and more'],
    shiftsLabel: 'WORKING HOURS',
    perks: ['For women and men', 'No language skills required', 'No experience required',
            'Part-time or full-time', 'Weekly payout · Bonuses'],
    cta: 'LEARN MORE',
    disclaimer: 'This content is for information purposes only and does not guarantee the availability of this particular offer.',
    // The line under both row banners: the vacancy list and the rate list end
    // the same way, which is why the key belongs to neither of them by name.
    linkLine: 'Link in the description',
    ratesHead: 'Find this',
    ratesAccent: 'job',
  },
  de: {
    eyebrow: 'TEILZEIT',
    headline: 'Flughafenpersonal gesucht',
    age: '18–65+ Jahre',
    audience: 'Studenten • Rentner • Eltern',
    unitTop: 'netto',
    unitBot: 'pro Stunde',
    jobsLabel: 'STELLENANGEBOTE',
    jobs: ['Bodenpersonal', 'Gepäckabfertigung', 'Reinigung', 'Sicherheitsdienst', 'Check-in', 'Catering', 'und weitere'],
    shiftsLabel: 'ARBEITSZEITEN',
    perks: ['Für Frauen und Männer', 'Deutschkenntnisse nicht erforderlich', 'Keine Berufserfahrung erforderlich',
            'Teilzeit oder Vollzeit', 'Wöchentliche Auszahlung · Boni'],
    cta: 'MEHR ERFAHREN',
    disclaimer: 'Dieser Inhalt dient ausschließlich zu Informationszwecken und garantiert nicht die Verfügbarkeit dieses konkreten Angebots.',
    ratesHead: 'Finde diesen',
    ratesAccent: 'Job',
    linkLine: 'Link in der Beschreibung',
  },
  it: {
    eyebrow: 'PART-TIME',
    headline: 'Cercasi personale aeroportuale',
    age: '18–65+ anni',
    audience: 'Studenti • Pensionati • Genitori',
    unitTop: 'netto',
    unitBot: "all'ora",
    jobsLabel: 'POSIZIONI APERTE',
    jobs: ['Personale di terra', 'Gestione bagagli', 'Pulizie', 'Sicurezza', 'Check-in', 'Catering', 'e altre'],
    shiftsLabel: 'ORARI DI LAVORO',
    perks: ['Per donne e uomini', 'Nessuna conoscenza linguistica richiesta', 'Nessuna esperienza richiesta',
            'Part-time o full-time', 'Pagamento settimanale · Bonus'],
    cta: 'SCOPRI DI PIÙ',
    disclaimer: 'Questo contenuto ha finalità puramente informative e non garantisce la disponibilità di questa specifica offerta.',
    ratesHead: 'Trova questo',
    ratesAccent: 'lavoro',
    linkLine: 'Link nella descrizione',
  },
  es: {
    eyebrow: 'MEDIA JORNADA',
    headline: 'Se busca personal de aeropuerto',
    age: '18–65+ años',
    audience: 'Estudiantes • Jubilados • Padres',
    unitTop: 'neto',
    unitBot: 'por hora',
    jobsLabel: 'VACANTES',
    jobs: ['Personal de tierra', 'Manejo de equipaje', 'Limpieza', 'Seguridad', 'Check-in', 'Catering', 'y más'],
    shiftsLabel: 'HORARIOS',
    perks: ['Para mujeres y hombres', 'No se requiere idioma', 'No se requiere experiencia',
            'Media jornada o jornada completa', 'Pago semanal · Bonos'],
    cta: 'MÁS INFORMACIÓN',
    disclaimer: 'Este contenido tiene únicamente fines informativos y no garantiza la disponibilidad de esta oferta concreta.',
    ratesHead: 'Encuentra este',
    ratesAccent: 'trabajo',
    linkLine: 'Enlace en la descripción',
  },
  fr: {
    eyebrow: 'TEMPS PARTIEL',
    headline: "Personnel d'aéroport recherché",
    age: '18–65+ ans',
    audience: 'Étudiants • Retraités • Parents',
    unitTop: 'net',
    unitBot: "de l'heure",
    jobsLabel: 'POSTES À POURVOIR',
    jobs: ['Personnel au sol', 'Traitement des bagages', 'Nettoyage', 'Sécurité', 'Enregistrement', 'Restauration', 'et plus'],
    shiftsLabel: 'HORAIRES',
    perks: ['Pour femmes et hommes', 'Aucune langue exigée', 'Aucune expérience exigée',
            'Temps partiel ou plein', 'Paiement hebdomadaire · Primes'],
    cta: 'EN SAVOIR PLUS',
    disclaimer: "Ce contenu est fourni à titre informatif uniquement et ne garantit pas la disponibilité de cette offre précise.",
    ratesHead: 'Trouve ce',
    ratesAccent: 'job',
    linkLine: 'Lien dans la description',
  },
  nl: {
    eyebrow: 'PARTTIME',
    headline: 'Luchthavenpersoneel gezocht',
    age: '18–65+ jaar',
    audience: 'Studenten • Gepensioneerden • Ouders',
    unitTop: 'netto',
    unitBot: 'per uur',
    jobsLabel: 'VACATURES',
    jobs: ['Grondpersoneel', 'Bagageafhandeling', 'Schoonmaak', 'Beveiliging', 'Check-in', 'Catering', 'en meer'],
    shiftsLabel: 'WERKTIJDEN',
    perks: ['Voor vrouwen en mannen', 'Geen taalkennis vereist', 'Geen ervaring vereist',
            'Parttime of fulltime', 'Wekelijkse uitbetaling · Bonussen'],
    cta: 'MEER INFORMATIE',
    disclaimer: 'Deze inhoud is uitsluitend ter informatie en garandeert niet de beschikbaarheid van dit specifieke aanbod.',
    ratesHead: 'Vind deze',
    ratesAccent: 'baan',
    linkLine: 'Link in de beschrijving',
  },
  pl: {
    eyebrow: 'NIEPEŁNY ETAT',
    headline: 'Poszukiwany personel lotniska',
    age: '18–65+ lat',
    audience: 'Studenci • Emeryci • Rodzice',
    unitTop: 'netto',
    unitBot: 'za godzinę',
    jobsLabel: 'OFERTY PRACY',
    jobs: ['Personel naziemny', 'Obsługa bagażu', 'Sprzątanie', 'Ochrona', 'Check-in', 'Catering', 'i więcej'],
    shiftsLabel: 'GODZINY PRACY',
    perks: ['Dla kobiet i mężczyzn', 'Znajomość języka niewymagana', 'Doświadczenie niewymagane',
            'Niepełny lub pełny etat', 'Wypłata tygodniowa · Premie'],
    cta: 'DOWIEDZ SIĘ WIĘCEJ',
    disclaimer: 'Treść ma charakter wyłącznie informacyjny i nie gwarantuje dostępności tej konkretnej oferty.',
    ratesHead: 'Znajdź tę',
    ratesAccent: 'pracę',
    linkLine: 'Link w opisie',
  },
};

/**
 * What the dictionary says for one field, or nothing if it is silent — a field
 * the phrase book has never heard of is a template's own, and the caller fills
 * it with a blank of the right kind rather than this file inventing one.
 */
export function phrase(locale: LocaleId, key: string): FieldValue | undefined {
  // The flag is the locale's own, not a phrase anybody wrote: keeping it here
  // rather than in seven tables is what stops an eighth locale shipping with a
  // German flag on the card.
  if (key === 'flag') return localeFlag(locale);
  const book = BY_LOCALE[locale] ?? BY_LOCALE[DEFAULT_LOCALE];
  return book[key] ?? SHARED[key];
}

/** The flag of the locale, which several templates put on the card. */
export const localeFlag = (locale: LocaleId): string =>
  FLAGS[locale] ?? FLAGS[DEFAULT_LOCALE];
