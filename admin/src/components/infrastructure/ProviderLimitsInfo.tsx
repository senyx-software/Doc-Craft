import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info, Zap } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';

// Reference values observed in Groq response headers. They are deliberately
// dated: provider-managed limits and availability must not become static health claims.
const snapshot = {
  model: 'openai/gpt-oss-120b',
  verifiedOn: '14 October 2026',
  tokensPerMinute: 8_000,
  requestsPerDay: 1_000,
};

export function ProviderAllowanceNotice({ showLink = true }: { showLink?: boolean } = {}) {
  return (
    <Card className="border-l-4 border-l-amber-500 text-left">
      <div className="flex items-start gap-3">
        <Info size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
          <h4 className="font-bold text-gray-900 dark:text-white">DocCraft allowance and AI provider limits</h4>
          <p>Changing a DocCraft plan or user allowance to 1,000 does not raise Groq’s token or request limits. A provider rate limit can interrupt AI chat while a user still has DocCraft allowance available.</p>
          {showLink && <Link to="/inf_api_usage" className="inline-flex font-semibold text-purple-600 dark:text-purple-400 hover:underline">View AI provider limits and HTTP 429 guidance →</Link>}
        </div>
      </div>
    </Card>
  );
}

export default function ProviderLimitsInfo() {
  return (
    <section className="space-y-6 text-left" aria-labelledby="provider-limits-title">
      <Card className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 id="provider-limits-title" className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
              <Zap size={18} className="text-purple-600 dark:text-purple-400" /> AI Provider Limits
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Groq · <span className="font-mono">{snapshot.model}</span></p>
          </div>
          <Badge variant="info">Reference verified {snapshot.verifiedOn}</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{snapshot.tokensPerMinute.toLocaleString('en-US')}</p>
            <p className="mt-1 text-xs font-semibold text-gray-900 dark:text-white">Tokens per minute</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">AI input and output usage, including conversation context.</p>
          </div>
          <div className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{snapshot.requestsPerDay.toLocaleString('en-US')}</p>
            <p className="mt-1 text-xs font-semibold text-gray-900 dark:text-white">Requests per day</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Provider API calls; one chat turn may make multiple calls.</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">These values were observed on {snapshot.verifiedOn}. Groq controls account and model limits. Check your provider account for current values and reset times.</p>
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-purple-600 dark:text-purple-400">
          <a href="https://console.groq.com/docs/rate-limits" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Groq limit documentation <ExternalLink size={12} /></a>
          <a href="https://console.groq.com/settings/limits" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Open Groq account limits <ExternalLink size={12} /></a>
        </div>
      </Card>

      <ProviderAllowanceNotice showLink={false} />

      <Card className="space-y-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white"><AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" /> Why chat reports “The AI provider is busy”</h4>
        <p className="text-xs text-gray-600 dark:text-gray-300">Groq returns HTTP 429 when a provider rate limit is reached. DocCraft displays this message and retains saved document details.</p>
        <ul className="list-disc pl-5 space-y-2 text-xs text-gray-600 dark:text-gray-300">
          <li>Chat history, document schemas, tool instructions, and tool calls consume tokens before a document is generated.</li>
          <li>Users and live development tests using the same Groq account share its provider limits.</li>
          <li>Repeated retries can hit the same limit. Use the provider’s reset time or Retry-After guidance before retrying.</li>
        </ul>
        <p className="text-xs text-gray-600 dark:text-gray-300">A successful small test verifies that request. A full conversation can still exceed a token or request budget. Availability should be checked when troubleshooting a failed response.</p>
      </Card>
    </section>
  );
}
