// Generic YAML-object -> Storyblok component schema + content inferrer.
//
// Used only for the one-off `pages/*.yaml` files, where each file has its
// own bespoke shape and is the only source for its component (no reuse
// across files, so there's no risk of two differently-shaped objects
// fighting over the same component's schema). The flat, repeated
// collections (drinks/categories/locations/settings) are hand-schema'd in
// collections-schema.mjs instead, since content.config.ts already defines
// their exact shape precisely -- inferring those generically risks a
// component's schema silently drifting depending on which file happened to
// be processed last.
import crypto from 'node:crypto';

const uid = () => crypto.randomUUID();

function sanitizeName(name) {
  return (
    name
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'field'
  );
}

function isLongText(s) {
  return typeof s === 'string' && s.length > 150;
}

// Registers a nested component's schema the first time its name is seen.
// Every subsequent reference (e.g. a shared "text_item" wrapper) reuses the
// existing schema untouched.
function registerComponent(components, name, schema) {
  if (!components.has(name)) components.set(name, { name, schema });
}

// Converts one YAML value into a Storyblok field-schema + field-content
// pair, registering any nested bloks components it needs along the way.
function convertValue(path, value, components) {
  if (value === null || value === undefined) {
    return { field: { type: 'text' }, content: '' };
  }
  if (typeof value === 'string') {
    return { field: { type: isLongText(value) ? 'textarea' : 'text' }, content: value };
  }
  if (typeof value === 'number') {
    // Storyblok's "number" field type stores its content as a string.
    return { field: { type: 'number' }, content: String(value) };
  }
  if (typeof value === 'boolean') {
    return { field: { type: 'boolean' }, content: value };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        field: { type: 'bloks', restrict_components: true, component_whitelist: [] },
        content: [],
      };
    }
    const allPrimitive = value.every((v) => typeof v !== 'object' || v === null);
    if (allPrimitive) {
      registerComponent(components, 'text_item', { value: { type: 'text' } });
      return {
        field: { type: 'bloks', restrict_components: true, component_whitelist: ['text_item'] },
        content: value.map((v) => ({ component: 'text_item', _uid: uid(), value: String(v) })),
      };
    }
    // Array of objects -- union the keys across every item so no field
    // present on only some entries gets dropped from the schema.
    const compName = sanitizeName(`${path}_item`);
    const unionKeys = new Set();
    value.forEach((item) => Object.keys(item || {}).forEach((k) => unionKeys.add(k)));
    const schema = {};
    const items = value.map((item) => {
      const contentItem = { component: compName, _uid: uid() };
      for (const key of unionKeys) {
        const { field, content } = convertValue(`${path}_${key}`, item?.[key], components);
        schema[sanitizeName(key)] = field;
        contentItem[sanitizeName(key)] = content;
      }
      return contentItem;
    });
    registerComponent(components, compName, schema);
    return {
      field: { type: 'bloks', restrict_components: true, component_whitelist: [compName] },
      content: items,
    };
  }

  // Plain nested object -- Storyblok has no bare "group of fields" content
  // type, so this becomes a singleton bloks field (max 1 item) holding one
  // nested component, which is the standard Storyblok pattern for this.
  const compName = sanitizeName(path);
  const schema = {};
  const contentItem = { component: compName, _uid: uid() };
  for (const [key, val] of Object.entries(value)) {
    const { field, content } = convertValue(`${path}_${key}`, val, components);
    schema[sanitizeName(key)] = field;
    contentItem[sanitizeName(key)] = content;
  }
  registerComponent(components, compName, schema);
  return {
    field: { type: 'bloks', restrict_components: true, component_whitelist: [compName], maximum: 1 },
    content: [contentItem],
  };
}

// Converts a whole parsed-YAML object (with its `type` key already
// stripped) into a root component's content, registering the root
// component's own schema plus every nested component it needed.
// `components` is a Map<name, {name, schema}> shared across a whole
// generation run so nested helper components (text_item, etc.) are only
// defined once.
export function convertRoot(rootName, obj, components) {
  const schema = {};
  const content = { component: rootName };
  for (const [key, val] of Object.entries(obj)) {
    const { field, content: c } = convertValue(`${rootName}_${key}`, val, components);
    schema[sanitizeName(key)] = field;
    content[sanitizeName(key)] = c;
  }
  // Storyblok requires a story's root content component to be flagged as a
  // "content type" (is_root: true) -- every nested component this function
  // registers along the way stays nestable-only (the default).
  components.set(rootName, { name: rootName, schema, is_root: true });
  return content;
}
