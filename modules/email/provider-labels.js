'use strict';
const setSize = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;

function providerLabels(value, origin) {
  let values;
  if (origin === 'imap_gmail_labels' && value instanceof Set && Object.getPrototypeOf(value) === Set.prototype) {
    if (setSize.call(value) > 100) return null;
    values = Array.from(Set.prototype.values.call(value));
  } else if (origin === 'gmail_label_ids' && Array.isArray(value) && value.length <= 100) {
    values = [];
    for (let index = 0; index < value.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(value, String(index));
      if (!entry || !Object.hasOwn(entry, 'value')) return null;
      values.push(entry.value);
    }
  } else return null;
  if (values.some(label => typeof label !== 'string' || !label.trim() || label.length > 200 ||
      /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(label) ||
      (origin === 'gmail_label_ids' && !/^[a-zA-Z0-9_-]+$/.test(label))) || new Set(values).size !== values.length) return null;
  // REST IDs are deliberately not translated into custom names or person roles.
  return { origin, scope: 'message', [origin === 'imap_gmail_labels' ? 'names' : 'ids']: values };
}

module.exports = { providerLabels };
