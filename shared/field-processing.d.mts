export const unresolvedStatuses: string[];
export function formatOrdinaryText(value: string): string;
export function formatFieldText(field: string, value: any, preserve?: boolean): any;
export function fieldRecord(field: string, rawValue: any, normalizedValue: any, source: any, status?: string, extra?: any): any;
export function currencyDigits(currency?: string): number;
export function formatMoney(value: number, currency?: string, locale?: string): string;
export function formatDate(value: string, format?: string): string;
export function possibleTypo(value: string, knownValues: string[]): string | undefined;

export function formatAddress(value: string, knownNames?: string[]): string;
export function formatNote(value: string): string;
export function formatAccountDetails(value: string): string;

export function literalSpan(message: string, snippet?: string): string | undefined;
export function deriveFieldEvidence(field: string, value: unknown, message: string): string | undefined;

export function preserveKnownNameCase(value: string, knownNames: string[]): string;
