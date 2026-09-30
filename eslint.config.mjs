// ESLint flat config.
//
// Deliberately not type-aware (no `projectService`): this repo mixes .astro,
// .ts and .mjs, and the type-aware rules would need a tsconfig that covers
// all three plus Astro's generated types. The non-type-aware set still
// catches what actually bites here - unused vars, shadowed globals, sloppy
// equality, and the Astro-specific mistakes below.
//
// Rules are set to the level we'll actually act on. Anything we'd routinely
// ignore is off rather than a warning nobody reads.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    // Build output, deps, and the generated Storyblok dumps. `dist/` is
    // minified by our own build hooks and would produce thousands of errors.
    ignores: [
      'dist/**',
      '.astro/**',
      '.wrangler/**',
      'node_modules/**',
      'storyblok/*.generated.json',
      'src/data/storyblok-snapshot.json',
      // Third-party builds, kept byte-for-byte with upstream so they can be
      // swapped for a new release without a diff to review.
      'public/vendor/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,

  // Everything we author runs as ESM.
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'off',

      // Leading underscore is our opt-out for a deliberately unused binding,
      // which comes up in destructuring and in catch blocks.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Storyblok's payloads are untyped by nature: the CMS decides the shape
      // at runtime and the field set changes without a code deploy. The
      // existing code uses `any` for those on purpose, so flagging it would
      // just add noise we'd suppress everywhere.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Astro components.
  {
    files: ['**/*.astro'],
    rules: {
      // Catches the class of bug this project has actually shipped: a
      // lowercase <fragment slot="head"> renders as literal text rather than
      // a Fragment, which is how JSON-LD once escaped into <body>.
      'astro/no-deprecated-astro-fetchcontent': 'error',
      'astro/no-unused-define-vars-in-style': 'error',
      'astro/valid-compile': 'error',

      // Astro's frontmatter and template share a scope in a way the base
      // rule misreads, and `astro check` already type-checks the frontmatter.
      // It's switched back on for the inline scripts below, which are plain
      // browser JS that nothing else checks.
      'no-undef': 'off',
    },
  },

  // Inline <script> blocks, as extracted by the Astro processor. `is:inline`
  // scripts are not type-checked by `astro check` and not bundled, so this is
  // the only thing standing between a typo'd identifier and a runtime
  // ReferenceError in the browser.
  {
    files: ['**/*.astro/*.js', '**/*.astro/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
    },
  },

  // Node scripts: the Storyblok tooling, the Astro config and the webhook
  // relay all run in Node, not the browser.
  {
    files: [
      'storyblok/**/*.mjs',
      'webhook-relay/**/*.{js,mjs}',
      '*.config.{mjs,ts}',
      'eslint.config.mjs',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Client-side scripts shipped from public/ are classic scripts with browser
  // globals, not modules.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Provided by the vendored MapLibre build, loaded by a <script> tag
        // before these run.
        maplibregl: 'readonly',
        // Analytics globals installed by the vendor snippets themselves.
        dataLayer: 'writable',
        gtag: 'writable',
        fbq: 'writable',
      },
    },
  },

  // The Storyblok rebuild relay is a Cloudflare Worker: Response, URL and
  // fetch are runtime globals there, not Node imports.
  {
    files: ['storyblok/rebuild-relay-worker/**/*.js'],
    languageOptions: {
      globals: { ...globals.worker },
    },
  },

  // Legacy shipped browser code: the inline <script> blocks in .astro pages
  // and the standalone files in public/js.
  //
  // These are classic scripts written in an older style, and several embed
  // vendor snippets verbatim (Meta's pixel loader, for one) that must stay
  // byte-identical to what the vendor publishes. Rewriting ~100 `var`s in
  // menu.astro's inline script to satisfy a style rule would be a large
  // untested diff across code that currently works, so the stylistic rules
  // are off here. The rules that catch actual defects - undefined variables,
  // unused bindings, sloppy equality - stay on.
  //
  // New browser code belongs in a module under src/, where the full set
  // applies.
  // The `*.astro/*.js` patterns are the inline <script> blocks: the Astro
  // processor extracts each one as a virtual file under the component's name,
  // so a plain '**/*.astro' pattern reaches the frontmatter only.
  {
    files: ['public/js/**/*.js', '**/*.astro', '**/*.astro/*.js', '**/*.astro/*.ts'],
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
      // `cond ? a() : b()` as a statement, and vendor IIFEs written `!function(){}()`.
      '@typescript-eslint/no-unused-expressions': 'off',
      // Deliberately empty catch blocks around localStorage, which throws
      // rather than returning null in private-browsing modes.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Unused *arguments* are fine in templates: `.map((item, i) => …)` is
      // idiomatic even when the index goes unused, and renaming them all to
      // `_i` would be churn. Unused *variables* still error, because those
      // are dead reads worth deleting - this rule has already found four.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // Tests.
  {
    files: ['tests/**/*.{ts,mjs}', '**/*.test.{ts,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
