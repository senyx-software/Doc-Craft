// Audit only: parse route declarations without importing or starting applications.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd(), records=[], reviewed=[];
const mounts={
 'auth/src/routes/auth.routes.ts':['','/v1/auth'], 'auth/src/routes/internal.routes.ts':['/internal'],
 'chat/src/routes/chat.routes.ts':['/api','/v1/chat/api'], 'chat/src/routes/mcp.routes.ts':['/api','/v1/chat/api'],
 'chat/src/routes/metrics.routes.ts':['/api','/v1/chat/api'], 'chat/src/routes/status.routes.ts':['/api'],
 'chat/src/routes/internal-resources.routes.ts':[''], 'quota/src/routes/health.routes.ts':['/health'],
 'quota/src/routes/quota.routes.ts':['/v1/quota'],'payment/src/routes/health.routes.ts':['/health'],
 'payment/src/routes/payment.routes.ts':['/v1/payment'],'notification/src/routes/notification.routes.ts':['/notification'],
 'gateway/src/routes/index.ts':[''], 'gateway/src/routes/auth.routes.ts':['/v1/auth','/v1/users'],
 'gateway/src/routes/chat.routes.ts':['/v1/ai','/v1/chat'], 'gateway/src/routes/document.routes.ts':['/v1/document','/v1/documents','/v1/templates'],
 'gateway/src/routes/payment.routes.ts':['/v1/payment','/v1/billing'], 'gateway/src/routes/quota.routes.ts':['/v1/quota'],
 'gateway/src/routes/notification.routes.ts':['/v1/notification','/v1/notifications'],'gateway/src/routes/analytics.routes.ts':['/v1/analytics'],
 'gateway/src/routes/admin.routes.ts':['/v1/admin','/v1/support'],
};
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()&&!['node_modules','dist','__tests__'].includes(d.name)?walk(path.join(dir,d.name)):d.isFile()&&d.name.endsWith('.ts')&&!d.name.endsWith('.test.ts')?[path.join(dir,d.name)]:[]);}
function value(n,env={}){if(!n)return null;if(ts.isStringLiteralLike(n))return n.text;if(ts.isIdentifier(n))return env[n.text]??null;if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken){const a=value(n.left,env),b=value(n.right,env);return a!==null&&b!==null?a+b:null;}return null;}
function resolveImport(file,module){if(!module.startsWith('.'))return null;const f=path.resolve(path.dirname(file),module).replace(/\.js$/,'.ts');return fs.existsSync(f)?path.relative(root,f):null;}
for(const file of walk(path.join(root,'services'))){
 const text=fs.readFileSync(file,'utf8'), relative=path.relative(root,file), key=relative.slice(9), service=key.startsWith('document/puppeteer/')?'pdf':key.split('/')[0];
 const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),imports={};
 for(const st of sf.statements)if(ts.isImportDeclaration(st)&&ts.isStringLiteral(st.moduleSpecifier)){const target=resolveImport(file,st.moduleSpecifier.text),b=st.importClause?.namedBindings;if(b&&ts.isNamedImports(b))for(const e of b.elements)imports[e.name.text]={source:target,symbol:e.propertyName?.text||e.name.text};else if(b&&ts.isNamespaceImport(b))imports[b.name.text]={source:target};}
 let hasRoute=false;
 function visit(node,env={}){
  if(ts.isForOfStatement(node)){
   let sequence=node.expression;while(ts.isAsExpression(sequence)||ts.isTypeAssertionExpression(sequence))sequence=sequence.expression;
   if(ts.isArrayLiteralExpression(sequence)){
    const binding=node.initializer.declarations?.[0]?.name;
    for(const item of sequence.elements){
     const bindings={};if(binding&&ts.isIdentifier(binding)){const v=value(item,env);if(v!==null)bindings[binding.text]=v;}
     else if(binding&&ts.isArrayBindingPattern(binding)&&ts.isArrayLiteralExpression(item))for(let i=0;i<binding.elements.length;i++){const name=binding.elements[i].name?.text,v=value(item.elements[i],env);if(name&&v!==null)bindings[name]=v;}
     visit(node.statement,{...env,...bindings});
    }return;
   }
  }
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
   const method=node.expression.name.text,receiver=node.expression.expression.getText(sf);
   if(['get','post','put','patch','delete','all','head','options'].includes(method)&&['app','router','fastify','server'].includes(receiver)){
    const route=value(node.arguments[0],env);if(route!==null){hasRoute=true;const last=node.arguments.at(-1),handler=last?.getText(sf)||'',line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
     let handlerSource=relative,handlerLine=line,handlerSymbol=handler,handlerBody=handler;
     const ident=ts.isIdentifier(last)?last.text:ts.isPropertyAccessExpression(last)?last.expression.getText(sf):null, im=imports[ident];
     if(im?.source){
      handlerSource=im.source;handlerSymbol=ts.isPropertyAccessExpression(last)?last.name.text:im.symbol;
      const htext=fs.readFileSync(path.join(root,handlerSource),'utf8'),hsf=ts.createSourceFile(handlerSource,htext,ts.ScriptTarget.Latest,true);
      const find=(symbol)=>{let result;function search(n){if((ts.isFunctionDeclaration(n)||ts.isVariableDeclaration(n)||ts.isMethodDeclaration(n))&&n.name?.getText(hsf)===symbol)result=n;else ts.forEachChild(n,search);}search(hsf);return result;};
      let target=find(handlerSymbol);if(target&&ts.isVariableDeclaration(target)&&target.initializer&&ts.isIdentifier(target.initializer))target=find(target.initializer.text)||target;
      if(target){handlerLine=hsf.getLineAndCharacterOfPosition(target.getStart(hsf)).line+1;handlerBody=target.getText(hsf);}
     }
     for(const prefix of mounts[key]||[''])records.push({service,method:method.toUpperCase(),route:prefix+(route==='/'&&prefix?'':route),handler:handler.length>220?`inline @ ${relative}:${line}`:handler,handler_symbol:handlerSymbol.length>180?'inline':handlerSymbol,handler_source:handlerSource,handler_line:handlerLine,source:relative,line,declared_route:route,mount:prefix,registration_args:node.arguments.slice(1,-1).map(n=>n.getText(sf)),source_text:node.getText(sf),handler_text:handlerBody,receiver});
    }
   }
  }
  ts.forEachChild(node,n=>visit(n,env));
 }
 visit(sf);if(hasRoute)reviewed.push(relative);
}
fs.writeFileSync('docs/production-audit/evidence/api-ts-extract.json',JSON.stringify({records,reviewed_files:reviewed},null,2)+'\n');
console.log(JSON.stringify({declarations:records.length,files:reviewed.length}));
