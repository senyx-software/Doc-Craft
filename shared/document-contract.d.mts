export const contract: any;
export const templates: Record<string, any>;
export function templateSchema(type: string, templateId?: string, documentSchema?: any): any;
export function documentType(value: string): string;
export function canonicalKey(key: string): string | undefined;
export function canonicalize(input?: Record<string, unknown>): Record<string, any>;
export function resolveDate(value: unknown, baseDate?: Date): any;
export function normalizeSlots(input?: Record<string, unknown>, existing?: Record<string, unknown>, now?: Date): Record<string, any>;
export function validField(key: string, value: unknown): boolean;
export function documentData(raw?: Record<string, unknown>): Record<string, any>;
export function formatDocumentMoney(value: number,data:Record<string,unknown>): string;
export function workflow(type: string, raw?: Record<string, unknown>, fields?: Record<string, any>, schema?: any, collection?: any): any;
export function toolSchema(type: string): any;

export function calendarDate(time?: number, timezone?: string): Date;
