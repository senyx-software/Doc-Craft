import TemplateUpload from '../../components/TemplateUpload';
import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { FileText, Code2, Eye, RefreshCw, UploadCloud, X } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip as ChartTooltip
} from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';
import { toast, getErrorMessage } from '../../store/toastStore';

interface DocumentsViewProps {
  activeSubItem: string;
}

const DocumentsView: React.FC<DocumentsViewProps> = ({ activeSubItem }) => {
  const [templates, setTemplates] = useState<Wire.Template[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [previewTemplate, setPreviewTemplate] = useState<Wire.Template | null>(null);

  const loadTemplatesFromApi = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getTemplates();
      if (Array.isArray(data)) {
        setTemplates(data);
      }
    } catch (err) {
      setTemplates([]);
      toast.error('Templates unavailable', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  });



  // Both populated from GET /admin/analytics/generations/detailed, which
  // reads the Document Service's real `documents` table directly (admin-api
  // and Document Service share the same Postgres database) — real document
  // type/template/status/timestamp per row. There is no byte-size column
  // anywhere in that table (PDFs are written to Supabase Storage by key,
  // and nothing measures/stores their size), so this table never shows a
  // fabricated file size the way it used to.
  const [docLogs, setDocLogs] = useState<Wire.Generation[]>([]);
  const [docBreakdown, setDocBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [isLoadingDocLogs, setIsLoadingDocLogs] = useState(true);

  const loadDocLogs = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getDetailedGenerationsAnalytics();
      const recent = Array.isArray(data?.recent_generations) ? data.recent_generations : [];
      setDocLogs(recent.map((row) => ({
        id: row.id,
        user: row.user,
        type: String(row.type || 'Unknown').toUpperCase(),
        template: row.template,
        status: row.status,
        date: row.date,
      })));

      const byType = Array.isArray(data?.by_type) ? data.by_type : [];
      setDocBreakdown(byType.map((row) => ({ name: row.name, value: row.count })));
    } catch (err) {
      console.warn('Doc logs fetch warning:', err);
    } finally {
      setIsLoadingDocLogs(false);
    }
  });
useEffect(() => {
    loadTemplatesFromApi();
  }, [loadTemplatesFromApi]);

  useEffect(() => {
    loadDocLogs();
  }, [loadDocLogs]);

  const handlePublishTemplate = async (templateId: string) => {
    try {
      await adminApiClient.publishTemplate(templateId);
      await loadTemplatesFromApi();
      toast.success('Template Published', `${templateId} is now live on the document rendering cluster.`);
    } catch (err) {
      toast.error('Publish Not Confirmed by Server', getErrorMessage(err));
    }
  };

  if (activeSubItem === 'doc_templates' || activeSubItem === 'doc_version_registry') {
    return (
      <div className="space-y-6 text-left">
        <Card className="">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200/60 dark:border-white/10">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                <FileText size={16} className="text-purple-600 dark:text-purple-400" />
                Document Template Version Registry (FR-ADM-01..03)
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Version review, private/public availability, publication and rollback</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadTemplatesFromApi} disabled={isLoadingTemplates} className="flex items-center gap-1">
                <RefreshCw size={12} className={isLoadingTemplates ? 'animate-spin' : ''} /> Reload Templates
              </Button>
              <Badge variant="primary">{templates.length} Templates Registered</Badge>
            </div>
          </div>

          <TemplateUpload onSaved={()=>void loadTemplatesFromApi()}/>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Template ID</th>
                  <th className="pb-3 font-bold">Template Name</th>
                  <th className="pb-3 font-bold">Document Type</th>
                  <th className="pb-3 font-bold">Active Version</th>
                  <th className="pb-3 font-bold">Last Modified</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono text-gray-500 dark:text-gray-400">{t.id}</td>
                    <td className="py-3 text-gray-900 dark:text-white font-bold">{t.name}</td>
                    <td className="py-3 font-semibold text-purple-600 dark:text-purple-400">{t.type}</td>
                    <td className="py-3 font-mono text-gray-500 dark:text-gray-400 font-bold">{t.version}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400">{t.lastUpdated}</td>
                    <td className="py-3">
                      <Badge variant={t.status === 'Published' ? 'success' : 'warning'}>{t.status}</Badge>
                    </td>
                    <td className="py-3 text-right flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(t)}>
                        <Eye size={12} /> Template Definition
                      </Button>
                      {t.status==='Review required'&&<Button variant="outline" size="sm" onClick={async()=>{try{await adminApiClient.approveTemplate(t.id);await loadTemplatesFromApi();}catch(error){toast.error('Approval failed',getErrorMessage(error));}}}>Approve reviewed version</Button>}
                      {t.status !== 'Published' && (
                        <Button variant="violet" size="sm" className="flex items-center gap-1.5" onClick={() => handlePublishTemplate(t.id)}>
                          <UploadCloud size={12} /> Publish Version
                        </Button>
                      )}
                      {t.status === 'Published' && <Button variant="outline" size="sm" onClick={async()=>{
                        try {await adminApiClient.withdrawTemplate(t.id);await loadTemplatesFromApi();toast.success('Template withdrawn','Availability has been saved.');}
                        catch(error){toast.error('Withdrawal failed',getErrorMessage(error));}
                      }}>Withdraw</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Source Preview Modal */}
        {previewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-2xl w-full p-6 space-y-4 border-gray-200 dark:border-white/10 shadow-2xl relative">
              <div className="pb-3 border-b border-gray-200/60 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 size={18} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Jinja2 HTML Template Source: {previewTemplate.name} ({previewTemplate.version})
                  </h3>
                </div>
                <button onClick={() => setPreviewTemplate(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={16} /></button>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider">Raw Template Source Code</label>
                <pre className="p-4 bg-neutral-950 text-emerald-400 font-mono text-xs rounded-md overflow-x-auto border border-neutral-800 max-h-80">
                  {previewTemplate.html_content || `<!-- DocCraft Jinja2 Template: ${previewTemplate.name} -->\n<div class="document-container">\n  <h1>{{ document_title }}</h1>\n  <p>Issued by {{ company_name }}</p>\n</div>`}
                </pre>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-gray-200/60 dark:border-white/10">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setPreviewTemplate(null)}><X size={12} /> Close Preview</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  if (activeSubItem === 'doc_all' || activeSubItem === 'doc_breakdown' || activeSubItem === 'doc_links' || activeSubItem === 'doc_history' || activeSubItem === 'doc_shared_analytics') {
    return (
      <div className="space-y-6 text-left">
        <Card className="">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200/60 dark:border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
              Generated Document Logs
            </h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadDocLogs} disabled={isLoadingDocLogs} className="flex items-center gap-1">
                <RefreshCw size={12} className={isLoadingDocLogs ? 'animate-spin' : ''} /> Reload
              </Button>
              <Badge variant="primary">{docLogs.length} Recent Logs</Badge>
            </div>
          </div>

          <TemplateUpload onSaved={()=>void loadTemplatesFromApi()}/>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Document ID</th>
                  <th className="pb-3 font-bold">Generating User</th>
                  <th className="pb-3 font-bold">Document Type</th>
                  <th className="pb-3 font-bold">Template Used</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 text-right font-bold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {docLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-appTextSecondary">
                      {isLoadingDocLogs ? 'Loading…' : 'No documents generated yet.'}
                    </td>
                  </tr>
                ) : (
                  docLogs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="py-3 font-mono text-gray-500 dark:text-gray-400">{doc.id}</td>
                      <td className="py-3 text-gray-900 dark:text-white font-bold">{doc.user}</td>
                      <td className="py-3 text-purple-600 dark:text-purple-400 font-bold">{doc.type}</td>
                      <td className="py-3 font-mono text-gray-500 dark:text-gray-400">{doc.template}</td>
                      <td className="py-3">
                        <Badge variant={doc.status === 'success' ? 'success' : doc.status === 'failed' ? 'danger' : 'secondary'}>
                          {doc.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-gray-500 dark:text-gray-400">{doc.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="h-[280px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Document Generation Breakdown by Category
          </h3>
          <div className="flex-1 w-full text-xs">
            {docBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-appTextSecondary">
                {isLoadingDocLogs ? 'Loading…' : 'No successful generations yet.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={docBreakdown}>
                  <XAxis dataKey="name" stroke="#97959E" fontSize={10} />
                  <YAxis stroke="#97959E" fontSize={10} />
                  <ChartTooltip />
                  <Bar dataKey="value" fill="#7367F0" name="Generations" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return null;
};

export default DocumentsView;
