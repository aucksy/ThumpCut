Grid tile for the media picker. A clip is never a photo with a play icon: video = teal border + play glyph + mono length.

```jsx
<MediaTile src={u} type="video" duration="0:12" order={3} selected />
<MediaTile src={u} type="video" dimmed />      // video cap reached
<MediaTile src={u} unavailable />              // failed download
```

The top-left badge is an empty ring until picked, then fills teal with the pick order in mono. Screen-reader label: "Video clip, item 3 of 9, selected."