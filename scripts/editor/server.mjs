import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const POSTS_DIR = path.join(ROOT, "src", "content", "posts");
const PUBLIC_DIR = path.join(ROOT, "public");
const EDITOR_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const HOST = "127.0.0.1";
const EDITOR_PORT = Number(process.env.EDITOR_PORT || 4322);
const PREVIEW_PORT = Number(process.env.ASTRO_PREVIEW_PORT || 4321);
const PREVIEW_ORIGIN = `http://${HOST}:${PREVIEW_PORT}`;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

let astroProcess;
let previewAvailable = false;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const ALLOWED_UPLOAD_EXTENSIONS = new Set(Object.keys(MIME_TYPES).filter((ext) =>
  [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm"].includes(ext),
));

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function safeFilename(value) {
  const name = path.basename(String(value || "").replace(/\\/g, "/"));
  const extension = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name))
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  if (!base || !ALLOWED_UPLOAD_EXTENSIONS.has(extension)) return null;
  return `${base}${extension}`;
}

function resolvePostFile(filename) {
  const normalized = String(filename || "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("..") || normalized.startsWith("/") || !normalized.toLowerCase().endsWith(".md")) {
    throw new Error("Invalid post filename.");
  }
  const fullPath = path.resolve(POSTS_DIR, normalized);
  if (!fullPath.startsWith(`${path.resolve(POSTS_DIR)}${path.sep}`)) {
    throw new Error("Invalid post path.");
  }
  return fullPath;
}

async function walkFiles(directory, base = directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkFiles(fullPath, base));
    } else if (entry.isFile()) {
      results.push(path.relative(base, fullPath).split(path.sep).join("/"));
    }
  }
  return results;
}

function parseScalar(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text === "true") return true;
  if (text === "false") return false;
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text); } catch { return text.slice(1, -1); }
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  if (text.startsWith("[") && text.endsWith("]")) {
    const inside = text.slice(1, -1).trim();
    if (!inside) return [];
    return inside.split(",").map((item) => String(parseScalar(item)).trim()).filter(Boolean);
  }
  return text;
}

function parsePost(raw, filename) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const metadata = {};
  let body = raw;
  if (match) {
    body = match[2];
    for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([\w-]+):\s*(.*)$/);
      if (field) metadata[field[1]] = parseScalar(field[2]);
    }
  }
  return {
    file: filename,
    title: typeof metadata.title === "string" ? metadata.title : filename.replace(/\.md$/i, ""),
    published: typeof metadata.published === "string" ? metadata.published.slice(0, 10) : new Date().toISOString().slice(0, 10),
    description: typeof metadata.description === "string" ? metadata.description : "",
    image: typeof metadata.image === "string" ? metadata.image : "",
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
    category: typeof metadata.category === "string" ? metadata.category : "",
    draft: metadata.draft === true,
    lang: typeof metadata.lang === "string" ? metadata.lang : "",
    body,
  };
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function slugify(value) {
  return String(value || "new-post")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || `post-${Date.now()}`;
}

async function listPosts() {
  const files = (await walkFiles(POSTS_DIR)).filter((file) => file.toLowerCase().endsWith(".md"));
  const posts = await Promise.all(files.map(async (file) => {
    const fullPath = resolvePostFile(file);
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = parsePost(raw, file);
    return {
      file,
      title: parsed.title,
      published: parsed.published,
      category: parsed.category,
      draft: parsed.draft,
      size: Buffer.byteLength(raw),
    };
  }));
  return posts.sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));
}

async function listMedia() {
  const files = await walkFiles(path.join(PUBLIC_DIR, "files"));
  return files
    .filter((file) => ALLOWED_UPLOAD_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => {
      const extension = path.extname(file).toLowerCase();
      const kind = extension.match(/^\.(png|jpe?g|webp|gif|svg)$/) ? "image"
        : extension.match(/^\.(mp3|wav|ogg|m4a)$/) ? "audio" : "video";
      return { name: file.split("/").pop(), file, src: `/files/${file}`, kind, extension };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

async function readRequestBody(request, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function optimizeImage(buffer, extension) {
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return null;
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.animated) return null;
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
    const widths = [480, 800, 1200, 1600].filter((width) => width < metadata.width);
    widths.push(metadata.width);
    const uniqueWidths = [...new Set(widths)].sort((a, b) => a - b);
    const generatedDir = path.join(PUBLIC_DIR, "generated");
    await fs.mkdir(generatedDir, { recursive: true });
    const variants = [];
    for (const width of uniqueWidths) {
      const output = path.join(generatedDir, `${hash}-${width}.webp`);
      await sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toFile(output);
      variants.push(`/generated/${hash}-${width}.webp ${width}w`);
    }
    return {
      srcset: variants.join(", "),
      sizes: "(max-width: 768px) 100vw, 800px",
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.warn("Image optimization skipped:", error.message);
    return null;
  }
}

async function handleUpload(request, response, url) {
  const filename = safeFilename(url.searchParams.get("name"));
  if (!filename) return sendJson(response, 400, { error: "Unsupported file name or file type." });
  const extension = path.extname(filename).toLowerCase();
  const contentType = request.headers["content-type"] || "application/octet-stream";
  const allowedMime = MIME_TYPES[extension];
  if (contentType !== "application/octet-stream" && !contentType.startsWith(allowedMime.split(";")[0])) {
    return sendJson(response, 400, { error: "File extension and content type do not match." });
  }
  const buffer = await readRequestBody(request, MAX_UPLOAD_BYTES);
  if (!buffer.length) return sendJson(response, 400, { error: "The uploaded file is empty." });

  const uploadDir = path.join(PUBLIC_DIR, "files", "editor");
  await fs.mkdir(uploadDir, { recursive: true });
  const base = path.basename(filename, extension);
  let finalName = filename;
  let counter = 2;
  while (true) {
    try {
      await fs.access(path.join(uploadDir, finalName));
      finalName = `${base}-${counter++}${extension}`;
    } catch {
      break;
    }
  }
  await fs.writeFile(path.join(uploadDir, finalName), buffer, { flag: "wx" });
  const src = `/files/editor/${finalName}`;
  const optimized = extension.match(/^\.(png|jpe?g|webp)$/) ? await optimizeImage(buffer, extension) : null;
  return sendJson(response, 201, {
    file: finalName,
    src,
    kind: extension.match(/^\.(png|jpe?g|webp|gif|svg)$/) ? "image"
      : extension.match(/^\.(mp3|wav|ogg|m4a)$/) ? "audio" : "video",
    ...(optimized || {}),
  });
}

async function handleSave(request, response) {
  const body = await readRequestBody(request);
  let payload;
  try { payload = JSON.parse(body.toString("utf8")); }
  catch { return sendJson(response, 400, { error: "Invalid JSON request." }); }

  const title = String(payload.title || "").trim();
  if (!title) return sendJson(response, 400, { error: "A post title is required." });
  const published = String(payload.published || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(published) || Number.isNaN(Date.parse(`${published}T00:00:00Z`))) {
    return sendJson(response, 400, { error: "Published date must use YYYY-MM-DD." });
  }

  let filename = String(payload.file || "").trim();
  const isNew = !filename;
  if (isNew) filename = `${slugify(title)}.md`;
  else if (!filename.toLowerCase().endsWith(".md")) filename += ".md";

  let fullPath;
  try { fullPath = resolvePostFile(filename); }
  catch (error) { return sendJson(response, 400, { error: error.message }); }
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  if (isNew) {
    try {
      await fs.access(fullPath);
      return sendJson(response, 409, { error: `A post named ${filename} already exists. Rename the title or open the existing post.` });
    } catch { /* file does not exist */ }
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(payload.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `published: ${published}`,
    `description: ${yamlString(payload.description || "")}`,
    `image: ${yamlString(payload.image || "")}`,
    `tags: ${JSON.stringify(tags)}`,
    `category: ${yamlString(payload.category || "")}`,
    `draft: ${payload.draft === true ? "true" : "false"}`,
    `lang: ${yamlString(payload.lang || "")}`,
    "---",
    "",
  ].join("\n");
  const markdown = String(payload.body || "").replace(/^\uFEFF/, "");
  await fs.writeFile(fullPath, `${frontmatter}${markdown.replace(/^\n+/, "")}`, "utf8");
  return sendJson(response, 200, { ok: true, file: filename, title, slug: filename.replace(/\.md$/i, "").split(path.sep).join("/") });
}

async function canReachPreview() {
  try {
    const response = await fetch(PREVIEW_ORIGIN, { signal: AbortSignal.timeout(700) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function startAstroPreview() {
  if (await canReachPreview()) {
    previewAvailable = true;
    console.log(`Using existing Astro dev server at ${PREVIEW_ORIGIN}`);
    return;
  }
  const astroCli = path.join(ROOT, "node_modules", "astro", "astro.js");
  try { await fs.access(astroCli); }
  catch {
    console.warn("Astro is not installed yet. Run pnpm install; the editor itself can still be used without live preview.");
    return;
  }
  astroProcess = spawn(process.execPath, [astroCli, "dev", "--host", HOST, "--port", String(PREVIEW_PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, HOST },
  });
  astroProcess.on("error", (error) => console.error("Could not start Astro preview:", error.message));
  for (let attempt = 0; attempt < 45; attempt++) {
    if (await canReachPreview()) {
      previewAvailable = true;
      console.log(`Astro preview ready at ${PREVIEW_ORIGIN}`);
      return;
    }
    if (astroProcess.exitCode !== null) break;
    await delay(500);
  }
  console.warn("Astro preview did not become available. You can still edit and save posts.");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${EDITOR_PORT}`);
  const origin = request.headers.origin;
  if (origin && origin !== `http://${HOST}:${EDITOR_PORT}`) {
    return sendJson(response, 403, { error: "Requests from other websites are not allowed." });
  }
  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      return sendJson(response, 200, { ok: true, previewAvailable, previewOrigin: PREVIEW_ORIGIN });
    }
    if (request.method === "GET" && url.pathname === "/api/posts") {
      return sendJson(response, 200, await listPosts());
    }
    if (request.method === "GET" && url.pathname === "/api/post") {
      const filename = url.searchParams.get("file");
      let fullPath;
      try { fullPath = resolvePostFile(filename); }
      catch (error) { return sendJson(response, 400, { error: error.message }); }
      const raw = await fs.readFile(fullPath, "utf8");
      return sendJson(response, 200, parsePost(raw, filename));
    }
    if (request.method === "GET" && url.pathname === "/api/media") {
      return sendJson(response, 200, await listMedia());
    }
    if (request.method === "POST" && url.pathname === "/api/post") {
      return await handleSave(request, response);
    }
    if (request.method === "POST" && url.pathname === "/api/upload") {
      return await handleUpload(request, response, url);
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await fs.readFile(path.join(EDITOR_DIR, "index.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return response.end(html);
    }
    if (request.method === "GET" && ["/app.js", "/styles.css"].includes(url.pathname)) {
      const file = path.join(EDITOR_DIR, path.basename(url.pathname));
      const data = await fs.readFile(file);
      response.writeHead(200, {
        "content-type": MIME_TYPES[path.extname(file)],
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      return response.end(data);
    }
    return sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : error.message === "Request is too large." ? 413 : 500;
    return sendJson(response, status, { error: error.message || "Internal editor error." });
  }
});

server.listen(EDITOR_PORT, HOST, async () => {
  console.log(`\nTelta's local post editor: http://${HOST}:${EDITOR_PORT}`);
  console.log("This editor only listens on your own computer; it is not part of the deployed website.\n");
  await startAstroPreview();
});

function shutdown() {
  if (astroProcess && astroProcess.exitCode === null) astroProcess.kill("SIGTERM");
  server.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
