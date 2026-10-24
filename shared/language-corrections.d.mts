export const languageToolSchema:any;
export function safeLanguageCorrection(text:string,knownNames?:unknown[]):string;
export function commonLanguageProposal(message:string,state:any):{field:string|null;original:string;suggested:string;reason:string}|null;
export function validateLanguageCorrection(input:any,state:any,message:string,mode?:string):any;
