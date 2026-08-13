# Privacy

## What is never captured

- `innerHTML`, `innerText`, `textContent` of any element
- Values of `<input>`, `<textarea>`, `<select>`
- Password, email, tel, and free-text (`type="text"`/`"search"`/`"number"`)
  input contents — the *fields themselves* are excluded from capture
  entirely, not just their values
- IP addresses inside the browser event payload
- Anything inside an element marked `data-private`, `data-ignore`, or
  `data-analytics-ignore` — including all of its descendants

## Opt-out attributes

```html
<div data-private>…</div>
<div data-ignore>…</div>
<div data-analytics-ignore>…</div>
```

Any of these on an element or any ancestor of an element causes clicks
(and other events sourced from that subtree) to be discarded before they
ever reach the event pipeline. `PrivacyFilter.shouldCapture(el)` walks up
the full ancestor chain, so:

```html
<div data-private>
  <button>Click</button>   <!-- also ignored -->
</div>
```

## Selector generation

`SelectorGenerator` never reads user-generated text. Selector priority is:

1. Stable unique `id`
2. Stable `data-*` test attributes (`data-testid`, `data-test`, `data-qa`,
   `data-cy`, `data-analytics-id`)
3. Semantic attributes (`role`, `aria-label`, `name`, `type`, `href`)
4. Stable class names (auto-generated / hashed classes like `css-x7f2a` or
   `sc-bdVaJa` are filtered out — they're unstable across builds)
5. Tag name
6. A limited structural path (max 3 ancestors, `:nth-of-type` only where
   necessary) — never a full `nth-child` chain, which would silently break
   as soon as the page's DOM structure changes

## Centralization

All privacy logic lives in `src/privacy/PrivacyFilter.ts` and
`SensitiveElementDetector.ts`. Collectors call `privacy.shouldCapture(el)`
and never implement their own filtering — this means the exclusion rules
only need to be correct in one place, and any new collector added later
automatically inherits them.

## Session identity

`anonymousId` is a random, non-reversible identifier persisted in
`localStorage`; `sessionId` rotates after a configurable inactivity window
(default 30 minutes). Neither is derived from PII, fingerprinting, or the
IP address. `analytics.identify(userId)` associates a known user id with
the existing anonymous id locally — it is up to the ingestion backend to
handle that linkage server-side; the SDK does not read cookies or headers
to construct identity.

## Do Not Track

Set `respectDoNotTrack: true` in `init()` to make the SDK become a no-op
(no collectors start, no events are queued) when the browser's DNT signal
is enabled. This defaults to `false` because DNT handling is a legal/
compliance decision each site operator should make explicitly.
