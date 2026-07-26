# Turn OS Branding

## Brand Hierarchy

- Product: **Turn OS**
- Current workspace/role: **Supervisor**
- Do not use: `Los's personal field view`

## Visual Direction

- Light mode first
- True white and neutral gray surfaces
- Black primary structure
- Bright blue for primary action and selected navigation
- Lime used sparingly for a positive active accent, never as decorative noise
- Calm, professional, operational, and legible in bright field conditions

## Fallback Wordmark

Until a final mark is supplied, use a code-native text lockup:

```text
Turn OS
Supervisor
```

The lockup must remain readable without an image asset. Do not convert the supplied white-background reference screenshot into an app icon.

## Reserved Asset Locations

- `public/brand/turn-os-mark.svg` — future approved vector app mark
- `public/brand/turn-os-wordmark.svg` — future approved wordmark
- `public/brand/README.md` — asset provenance and approval record

Do not reference these paths in runtime code until an approved file exists.

## Candidate Tokens

| Token | Light | Dark-compatible intent |
| --- | --- | --- |
| `--turn-bg` | `#FFFFFF` | `#0A0D12` |
| `--turn-surface` | `#F6F8FB` | `#121720` |
| `--turn-surface-strong` | `#FFFFFF` | `#1A202B` |
| `--turn-text` | `#0A0D12` | `#F7F9FC` |
| `--turn-muted` | `#5D6673` | `#AAB3BF` |
| `--turn-border` | `#DCE2EA` | `#303846` |
| `--turn-blue` | `#1677FF` | `#4B97FF` |
| `--turn-blue-strong` | `#075FDC` | `#76B0FF` |
| `--turn-lime` | `#B7E72B` | `#C8F04A` |
| `--turn-danger` | `#C9362B` | `#FF766D` |

## Interface Rules

- Use familiar iPhone conventions without cloning Apple or ChatGPT.
- Prefer clean sheets, open lists, and decisive typography over nested card grids.
- Use subtle transitions only when they clarify state.
- All controls retain visible focus and at least 44-point targets.
- Honor reduced motion and avoid horizontal overflow.
