# Dixlab promo video

A 46-second motion graphic (1920×1080, 30fps) made with [Remotion](https://www.remotion.dev): React code that renders to MP4. Every screen in it is a real capture of the Dixlab app, using a sample person ("Maya Chen") rather than real accounts.

## Watch or edit

```powershell
cd video
npm install          # first time only
npm run studio       # opens an editor in your browser: scrub the timeline, see changes live
npm run render       # writes out/dixlab-promo.mp4
```

## What's where

| File | What it is |
|---|---|
| `src/Promo.jsx` | The eight scenes, their order and length (`SCENES`), all the captions |
| `src/kit.jsx` | Shared pieces: brand colours and fonts, the browser and phone frames, animated captions |
| `public/shots/` | The app screenshots (captured at 2× so zooms stay sharp) |
| `public/logo.svg` | The Dixlab wordmark, copied from the frontend |

**To change a caption**, edit its text in `src/Promo.jsx`. **To change timing**, edit the frame counts in `SCENES` (30 frames = 1 second). Run `npm run studio` to preview, then `npm run render`.

## The scenes

1. **Intro:** "Turn your work into opportunities."
2. **Talk it through:** the interview screen, with a voice waveform
3. **We write it up:** the case study editor and its live preview
4. **Pick a look:** a portfolio, a case study and a CV fanned out
5. **Make it yours:** a change typed into Customize, then applied
6. **Publish:** the "Your link is live" dialog, with "Link copied"
7. **Get noticed:** the portfolio on desktop and phone, with a new message arriving
8. **Outro:** the logo and "Start free at dixlab.app"

## Updating the screenshots

The shots were taken in headless Chrome against a local test server with sample data, so the video shows the app as it is today. If the UI changes, re-capture them the same way and keep the same file names. The publish dialog's address was shown as `dixlab.app/p/maya-chen` instead of the local test address; that's the only edited text.

## Licence note

Remotion is free for individuals and companies of up to 3 people. Larger teams need a [company licence](https://www.remotion.dev/license).
