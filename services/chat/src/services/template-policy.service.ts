import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { templates } from '../../../../shared/document-contract.mjs';
import { ConversationError } from './conversation.repository.js';
import { getEntitlements, requireEntitlement } from '../../../../shared/entitlements.mjs';
export async function requirePublishedTemplate(templateId:string, userId:string) {
  if(templateId.startsWith('upl_')) {
    const response=await serviceFetch('admin-api',`${process.env.ADMIN_API_SERVICE_URL || 'http://localhost:3018'}/api/v1/internal/uploaded-templates/${encodeURIComponent(templateId)}?user_id=${encodeURIComponent(userId)}`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new ConversationError(response.status===404?404:503,'Template unavailable');
    const definition=await response.json() as any;
    if(definition.id!==templateId || !Array.isArray(definition.documentTypes))throw new ConversationError(503,'Invalid template descriptor');
    if(definition.premium)requireEntitlement(await getEntitlements(userId),'premium_templates');
    templates[templateId]=definition;
    return;
  }
  const template=templates[templateId];
  if(!template) throw new ConversationError(400,'Unknown template');
  try {
    const response=await serviceFetch('admin-api',`${process.env.ADMIN_API_SERVICE_URL || 'http://localhost:3018'}/api/v1/internal/config/template_catalog`);
    if(!response.ok)throw new Error('Template policy unavailable');
    const body=await response.json() as {data?:Record<string,{published?:boolean}>};
    if(!body.data)throw new Error('Invalid template policy');
    const policy=await getEntitlements(userId);
    if(!policy.account_enabled) throw new ConversationError(403,'Account unavailable');
    if((body.data[template.type+':'+template.variant] as any)?.premium===true) requireEntitlement(policy,'premium_templates');
    if(body.data[template.type+':'+template.variant]?.published===false)throw new ConversationError(403,'This template is currently unavailable');
  } catch(error){if(error instanceof ConversationError)throw error;throw new ConversationError(503,'Template availability cannot be verified');}
}
