import type { DocumentTypeInfo } from '../types/document.types';

export const DOCUMENT_TYPES: DocumentTypeInfo[] = [
  {
    type: 'invoice',
    label: 'Invoice',
    description: 'Bill clients for services rendered or products sold',
    icon: 'FileText',
  },
  {
    type: 'quotation',
    label: 'Quotation',
    description: 'Provide price estimates for potential work',
    icon: 'FileSearch',
  },
  {
    type: 'proposal',
    label: 'Proposal',
    description: 'Present detailed project plans to clients',
    icon: 'Presentation',
  },
  {
    type: 'receipt',
    label: 'Receipt',
    description: 'Confirm payments received from clients',
    icon: 'Receipt',
  },
  {
    type: 'purchase_order',
    label: 'Purchase Order',
    description: 'Order goods or services from suppliers',
    icon: 'ShoppingCart',
  },
];
