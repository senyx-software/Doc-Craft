export const languageToolSchema: Record<string, unknown>;

export interface LanguageCorrectionProposal {
  suggested: string;
  field?: string | null;
  previousValue?: string;
  question: string;
  automatic: boolean;
  editingSaved: boolean;
}

export function validateLanguageCorrection(
  input: unknown,
  state: any,
  message: string,
  mode?: string
): LanguageCorrectionProposal;

export function commonLanguageProposal(
  message: string,
  state: any
): { suggested: string; field?: string | null } | null;
