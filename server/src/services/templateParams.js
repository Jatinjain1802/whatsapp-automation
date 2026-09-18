// Resolve {{1}}, {{2}}... template variables against a contact document.
// Shared by the send worker and the campaign preview endpoint.

// mapping arrives either as a plain object (JSON request body), a JS Map, or
// a Mongoose Map. Object.entries() on a Mongoose Map returns internal fields,
// not the mapping, so normalize through entries() first.
function mappingEntries(mapping) {
  if (!mapping) return [];
  if (mapping instanceof Map) return [...mapping.entries()];
  if (typeof mapping.entries === 'function') return [...mapping.entries()];
  return Object.entries(mapping);
}

export function buildTemplateParams(mapping, contact) {
  // mapping: { "1": "name", "2": "customFields.orderId" }
  return mappingEntries(mapping)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, path]) => resolvePath(contact, path));
}

export function resolvePath(contact, path) {
  if (!path || !contact) return '';
  if (path.startsWith('customFields.')) {
    const key = path.slice('customFields.'.length);
    const cf = contact.customFields;
    if (!cf) return '';
    if (cf instanceof Map) return cf.get(key) ?? '';
    return cf[key] ?? '';
  }
  return contact[path] ?? '';
}
