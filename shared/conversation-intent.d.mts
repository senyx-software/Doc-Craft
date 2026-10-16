export function identifyIntent(message: string, state?: any): {kind: string; targetType?: string; intents: string[]; acceptsPendingAnswer: boolean; allowsMutation: boolean};
export function requestedField(text: string, state?: any): string | undefined;
export function explicitItemOperation(message: string, state: any): any;
export function supportsField(type: string, field: string): boolean;

export const ITEM_VALUE_LINK: string;
