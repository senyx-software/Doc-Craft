export interface EditorContext {elements:Array<{id:string;type:string;label:string;x?:number;y?:number;w?:number;h?:number;fontSize?:number;fontWeight?:number}>;selectedIds:string[]}
export function editorContext(input:unknown):EditorContext;
export const editorToolSchema:any;
export function applyEditorOperations(layout:unknown,context:unknown,operations:any[],message:string,operationId?:string):{layout:any;context:EditorContext;response:string};
export function resolveEditorCommand(message:string,state:any):{operations:any[];remaining:string;clarification?:string;pending?:any;effectiveMessage?:string};
export function historySnapshot(session:any):any;
export function recordHistory(meta:any,session:any,turnId:string):void;
