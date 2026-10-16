# DocCraft — Data Models (extracted from SRS v2.0)

Derived from Sections 3, 6, 7, 8, 10, 11. Timestamp fields (`createdAt`, `updatedAt`, etc.)
are added even where the SRS doesn't state them explicitly, since you'll need them for
auditing, quota resets, and admin views.

---

## 1. User
```ts
interface User {
  id: string;                     // UUID (Supabase auth.users.id)
  email: string;
  passwordHash?: string;          // bcrypt, min. 12 rounds — null if OAuth-only
  fullName?: string;
  avatarUrl?: string;
  authProvider: 'email' | 'google';
  userClass: 'freelancer' | 'smb_owner' | 'guest' | 'admin' | 'super_admin';
  plan: 'free' | 'pro';
  twoFactorEnabled: boolean;
  totpSecret?: string;            // encrypted at rest
  backupCodes?: string[];         // hashed
  failedLoginAttempts: number;
  lockedUntil?: string;           // ISO datetime, brute-force lock (5 attempts)
  refreshTokenHash?: string;
  isGuest: boolean;
  status: 'active' | 'suspended' | 'banned';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  deletedAt?: string;             // soft delete / GDPR erasure
}
```

## 2. GuestSession
```ts
interface GuestSession {
  id: string;
  sessionToken: string;
  quotaUsed: number;               // capped at 1 document
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
}
```

## 3. DocumentType
```ts
interface DocumentType {
  id: string;
  name: 'invoice' | 'quotation' | 'proposal' | 'receipt' | 'purchaseOrder';
  slotSchema: SlotDefinition[];    // typed fields the AI must collect
  createdAt: string;
  updatedAt: string;
}

interface SlotDefinition {
  key: string;                     // e.g. "invoiceNumber", "lineItems"
  type: 'string' | 'number' | 'date' | 'array' | 'boolean' | 'image';
  required: boolean;
  optional?: boolean;
  proOnly?: boolean;                // e.g. logo upload
}
```

## 4. Template
```ts
interface Template {
  id: string;
  documentTypeId: string;
  name: 'classic' | 'modern' | 'minimal';
  thumbnailUrl: string;
  htmlPath: string;                 // Jinja2/HTML file path
  isPremium: boolean;
  colorPalettePresets: string[];    // min. 6 hex codes
  createdAt: string;
  updatedAt: string;
}
```

## 5. ChatSession
```ts
interface ChatSession {
  id: string;
  userId: string;
  documentTypeId: string;
  templateId: string;
  status: 'active' | 'completed' | 'abandoned';
  slots: Record<string, any>;       // collected data, keyed by SlotDefinition.key
  accentColor?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: string;               // session TTL
}
```

## 6. ChatMessage
```ts
interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  flaggedPromptInjection: boolean;
  createdAt: string;
}
```

## 7. LayoutConfig (per generated document)
```ts
interface LayoutConfig {
  sectionAlignments: Record<string, 'left' | 'center' | 'right'>;
  fontSizes: Record<string, 'small' | 'medium' | 'large'>;
  boldFlags: Record<string, boolean>;
  italicFlags: Record<string, boolean>;
  visibility: Record<string, boolean>; // logo, notes, payment terms, footer
  lineItemOrder: string[];             // drag-and-drop order of line item IDs
  accentColor: string;
  updatedAt: string;
}
```

## 8. GeneratedDocument
```ts
interface GeneratedDocument {
  id: string;
  userId: string;
  documentTypeId: string;
  templateId: string;
  chatSessionId: string;
  documentNumber: string;
  slots: Record<string, any>;
  layoutConfig: LayoutConfig;
  status: 'draft' | 'previewed' | 'generating' | 'ready' | 'failed';
  pdfUrl?: string;
  watermarked: boolean;
  fileName: string;                 // [DocType]-[DocNumber]-[ClientName].pdf
  createdAt: string;
  updatedAt: string;
  generatedAt?: string;
  storageExpiresAt?: string;        // temp Supabase storage expiry
  deletedAt?: string;
}
```

## 9. ShareLink
```ts
interface ShareLink {
  id: string;
  documentId: string;
  token: string;
  expiresAt: string;                // 1–30 days, user-selectable
  createdAt: string;
  revokedAt?: string;
  viewCount: number;
}
```

## 10. PDFJob (BullMQ)
```ts
interface PDFJob {
  jobId: string;
  documentId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;                 // retry up to 3, exponential backoff
  idempotencyKey: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

## 11. Quota
```ts
interface Quota {
  id: string;
  userId: string;
  used: number;
  limit: number;
  periodStart: string;
  resetsAt: string;                 // daily reset, midnight UTC
  overrideLimit?: number;
  overrideReason?: string;
  overriddenByAdminId?: string;
  updatedAt: string;
}
```

## 12. Plan
```ts
interface Plan {
  id: string;
  name: 'Free' | 'Pro';
  priceMonthly?: number;            // LKR 990
  priceYearly?: number;             // LKR 9,000
  billingCycle: 'monthly' | 'yearly';
  features: {
    documentsPerDay: number | 'unlimited';
    watermark: boolean;
    customLogo: boolean;
    allTemplates: boolean;
    priorityQueue: boolean;
    shareLinkMaxDays: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

## 13. Subscription
```ts
interface Subscription {
  id: string;
  userId: string;
  planId: string;
  gateway: 'paddle' | 'payhere';      // which payment provider processed this
  paddleCustomerId?: string;           // Paddle customer ID (non-LK users)
  paddleSubscriptionId?: string;       // Paddle subscription ID
  payhereSubscriptionId?: string;      // PayHere order/subscription ID (LK users)
  status: 'active' | 'past_due' | 'cancelled';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}
```

## 14. BillingInvoice (Stripe-side, distinct from GeneratedDocument)
```ts
interface BillingInvoice {
  id: string;
  userId: string;
  subscriptionId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'failed' | 'refunded';
  pdfUrl?: string;
  createdAt: string;
  paidAt?: string;
}
```

## 15. Coupon
```ts
interface Coupon {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  value: number;
  expiresAt: string;
  usageLimit?: number;
  usageCount: number;
  createdAt: string;
  deletedAt?: string;
}
```

## 16. NotificationLog
```ts
interface NotificationLog {
  id: string;
  userId: string;
  type: 'welcome' | 'renewal' | 'payment_failed' | 'document_ready' | 'cancellation';
  channel: 'email';
  status: 'queued' | 'sent' | 'failed';
  payload: Record<string, any>;
  dedupeKey: string;
  createdAt: string;
  sentAt?: string;
}
```

## 17. NotificationPreference
```ts
interface NotificationPreference {
  userId: string;
  marketing: boolean;
  billing: boolean;
  documentReady: boolean;
  updatedAt: string;
}
```

## 18. AnalyticsEvent
```ts
interface AnalyticsEvent {
  id: string;
  userId?: string;                  // anonymized before PostHog ingestion
  eventName: string;
  properties: Record<string, any>;
  anonymized: boolean;
  createdAt: string;
}
```

## 19. AuditLog (admin actions)
```ts
interface AuditLog {
  id: string;
  adminId: string;
  action: string;                   // e.g. "quota.override", "user.suspend"
  targetType: 'user' | 'subscription' | 'coupon' | 'plan' | 'document';
  targetId: string;
  reason?: string;
  ipAddress: string;
  requires2FA: boolean;
  createdAt: string;
}
```

## 20. Announcement
```ts
interface Announcement {
  id: string;
  type: 'info' | 'warning' | 'maintenance';
  message: string;
  active: boolean;
  createdAt: string;
  expiresAt?: string;
  createdByAdminId: string;
}
```

## 21. AdminUser
```ts
interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'super_admin';
  twoFactorEnabled: boolean;        // mandatory
  ipWhitelist: string[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}
```

---

### Notes on relationships
- `User 1—N ChatSession 1—N ChatMessage`
- `ChatSession 1—1 GeneratedDocument` (on completion)
- `GeneratedDocument 1—N PDFJob`, `GeneratedDocument 1—0/1 ShareLink`
- `User 1—1 Quota`, `User 1—0/1 Subscription N—1 Plan`
- `Subscription 1—N BillingInvoice`
- `AdminUser 1—N AuditLog`

### Timestamp convention used throughout
Every model carries at least `createdAt`; mutable models add `updatedAt`; anything with
a lifecycle (jobs, sessions, links, quotas) adds a specific `*At` milestone field
(`completedAt`, `resetsAt`, `expiresAt`, `sentAt`, etc.) rather than overloading `updatedAt`.
