# Brand assets — source of truth

Supplied by the project owner. **Do not recolour, redraw or re-export these.**

| File | What it is | Transparency |
|---|---|---|
| `source/radif-emblem.png` | the ribbon “R” emblem, standalone | transparent |
| `source/radif-lockup-source.png` | emblem + lowercase wordmark | transparent |
| `source/radif-lockup-caps-source.png` | emblem + uppercase RADIF | transparent |
| `source/radif-presentation.png` | brand presentation panel (navy) | opaque |

Brand orange is **#F87820**. It is *not* the UI accent token **#FF852E**: the
palette is fixed by the client's token sheet, the mark is the brand's own file,
and the two are never mixed inside one component. See DIRECTION.md §3.

Derived files are generated, never edited by hand:

```bash
python scripts/brand-assets.py
```

That writes `public/brand/*` (lockups for the UI), `public/icons/*` (PWA incl.
a maskable tile), `src/app/icon.png`, `src/app/apple-icon.png` and
`src/app/favicon.ico` — all trimmed from the same source with an even margin,
composited on the product ground `#000014` where an icon must be opaque.
