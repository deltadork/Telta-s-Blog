# Telta's local post editor

This is a local-only writing tool for the Astro blog. It edits the existing Markdown files in `src/content/posts` and stores uploaded media in `public/files/editor`.

## Start

From the project root:

```powershell
pnpm install
pnpm editor
```

Open **http://127.0.0.1:4322**. The editor starts the Astro development preview at `http://127.0.0.1:4321` automatically when dependencies are installed. Stop both processes with `Ctrl+C` in the terminal.

If port 4321 is already occupied by another Astro server, the editor will use it for previews. To change the ports:

```powershell
$env:EDITOR_PORT=4323
$env:ASTRO_PREVIEW_PORT=4324
pnpm editor
```

## What it does

- Loads and edits existing Markdown posts without changing their article body until you save.
- Creates normal `.md` posts in `src/content/posts`.
- Inserts the blog's existing `::section`, `::img`, `::nsfw`, `::audio`, and `::video` shortcodes.
- Keeps direct Markdown editing available.
- Uploads images/audio/video into `public/files/editor`.
- Generates responsive WebP variants for uploaded PNG, JPG, and WebP images using the project's existing `sharp` dependency.
- Uses the real local Astro post page for preview.

The editor binds only to `127.0.0.1`; it is not an admin page deployed to the public website. Saving changes files in your working copy, but does not publish or deploy them.
