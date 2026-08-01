Primary action button — bone fill on graphite; one primary per screen, everything else outline or text.

```jsx
<Button full>Export</Button>
<Button variant="secondary">Shuffle order</Button>
<Button variant="destructive">Cancel</Button>
```

Variants: primary (bone fill), secondary (hairline outline), destructive (red text only — Cancel during render), ghost (quiet). `disabled` on primary = bone-12 fill. Press = scale .97 spring, no color flash.