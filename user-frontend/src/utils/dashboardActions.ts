import { useChatStore } from '../store/chatStore';
import { useDocumentStore } from '../store/documentStore';

export function startNewDocument() {
  useChatStore.getState().resetChat();
  useDocumentStore.getState().resetDocument();
  window.location.href = '/builder?new=true';
}
