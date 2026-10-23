/** Small, reviewed knowledge base; never claims to know live rates or legislation. */
export function localKnowledge(message) {
  if(/(?:difference|differ|compare).*(?:invoice.*(?:quotation|quote)|(?:quotation|quote).*invoice)/i.test(message)&&!/(?:change|update|make|add|remove|set)\s+(?:the\s+)?(?:customer|client|item|tax|invoice|quotation)/i.test(message))return 'An invoice requests payment for supplied goods or services. A quotation describes proposed work and prices before a customer accepts. Your current document is unchanged.';
  if(/^\s*(?:what is|what does|explain)\s+(?:an?\s+)?(?:subtotal)(?:\s+mean)?[?!.]?\s*$/i.test(message))return 'The subtotal is the sum of the line items before document-level tax or discount. I calculate the final total from your saved quantities, prices, tax and discount settings.';
  return null;
}
