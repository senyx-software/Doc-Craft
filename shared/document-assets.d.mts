export interface DocumentAsset { id:string; role:'logo'|'image'|'signature'; name:string; src:string; width:number; height:number; hash?:string; }
export const MAX_ASSET_LENGTH:number;
export const MAX_DOCUMENT_ASSETS:number;
export const ASSET_ROLES:string[];
export function validAsset(asset:unknown):asset is DocumentAsset;
export function documentAssets(raw:unknown):DocumentAsset[];
export function placeAsset(asset:DocumentAsset,elements:any[],pageWidth?:number,pageHeight?:number):{x:number;y:number;w:number;h:number};
export function assetElements(assets:DocumentAsset[],base:any[],pageWidth?:number,pageHeight?:number):any[];
