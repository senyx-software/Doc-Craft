// Providers need current verified facts and unresolved decisions, not the
// duplicated raw input, provenance or finalization fingerprint in API state.
// Full snapshots still go to persistence/frontend; only model context is reduced.
export function modelTaskState(state) {
    return {
        documentType:state.documentType,slots:state.slots,
        ...(state.assets?.length?{assets:state.assets.map(({id,role,name})=>({id,role,name}))}:{}),
        fieldStates:Object.fromEntries(Object.entries(state.fieldStates||{}).map(([field,record])=>[field,Object.fromEntries(['status','proposed','original','question','pending','formatting'].filter(key=>record[key]!==undefined).map(key=>[key,record[key]]))])),
        requiredFields:state.schema?.required_keys,missingRequired:state.missingRequired,
        nextAction:state.nextAction,pendingIntent:state.pendingIntent,
        stage:state.stage,revision:state.revision,readyToGenerate:state.readyToGenerate,
        finalization:state.finalization?{status:state.finalization.status}:undefined,
        operationResults:state.operationResults,hint:state.hint
    };
}

export function modelToolText(content) {
    if(!Array.isArray(content))return JSON.stringify(content);
    return content.map(block=>{
        if(block.type!=='text')return JSON.stringify(block);
        try {
            const payload=JSON.parse(block.text);
            if(payload?.slots&&payload?.documentType)return JSON.stringify(modelTaskState(payload));
        } catch { /* Keep validation/error feedback intact. */ }
        return block.text;
    }).join('\n');
}
