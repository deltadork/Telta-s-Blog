const $ = (selector) => document.querySelector(selector);
const elements = {
  postList: $("#postList"),
  title: $("#title"),
  published: $("#published"),
  category: $("#category"),
  description: $("#description"),
  tags: $("#tags"),
  cover: $("#cover"),
  lang: $("#lang"),
  draft: $("#draft"),
  body: $("#body"),
  workspaceTitle: $("#workspaceTitle"),
  saveState: $("#saveState"),
  saveButton: $("#saveButton"),
  previewButton: $("#previewButton"),
  wordCount: $("#wordCount"),
  mediaDialog: $("#mediaDialog"),
  mediaTitle: $("#mediaTitle"),
  mediaList: $("#mediaList"),
  mediaSearch: $("#mediaSearch"),
  uploadInput: $("#uploadInput"),
  previewFrame: $("#previewFrame"),
  markdownTab: $("#markdownTab"),
  previewTab: $("#previewTab"),
  toast: $("#toast"),
};

let activeFile = null;
let isDirty = false;
let mediaMode = "image";
let mediaItems = [];
let previewOrigin = "http://127.0.0.1:4321";
let previewAvailable = false;
let toastTimer;
let previewStatusTimer;

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function shortcodeValue(value) {
  return String(value ?? "").replace(/["{}\r\n]/g, " ").trim();
}

function quoteAttribute(value) {
  return `"${shortcodeValue(value)}"`;
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3000);
}

function setDirty(dirty = true) {
  isDirty = dirty;
  elements.saveState.textContent = dirty ? "Unsaved changes" : activeFile ? "All changes saved" : "Not saved yet";
  elements.saveState.classList.toggle("saved", !dirty && Boolean(activeFile));
  elements.saveButton.textContent = dirty ? "Save changes" : "Save post";
}

function updateWordCount() {
  const words = elements.body.value.trim().match(/\S+/g)?.length || 0;
  elements.wordCount.textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
}

function setEditorTab(tab) {
  const preview = tab === "preview";
  elements.markdownTab.classList.toggle("active", !preview);
  elements.previewTab.classList.toggle("active", preview);
  elements.body.hidden = preview;
  elements.previewFrame.hidden = !preview;
  if (preview && activeFile && previewAvailable) refreshPreview();
}

function setFieldValues(post = {}) {
  elements.title.value = post.title || "";
  elements.published.value = post.published || today();
  elements.category.value = post.category || "";
  elements.description.value = post.description || "";
  elements.tags.value = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  elements.cover.value = post.image || "";
  elements.lang.value = post.lang || "";
  elements.draft.checked = post.draft !== false;
  elements.body.value = post.body || "";
  elements.workspaceTitle.textContent = post.title || "New post";
  updateWordCount();
  setDirty(false);
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadStatus() {
  try {
    const status = await api("/api/status");
    previewAvailable = status.previewAvailable;
    previewOrigin = status.previewOrigin;
    if (previewAvailable && previewStatusTimer) {
      clearInterval(previewStatusTimer);
      previewStatusTimer = null;
      elements.previewButton.title = "Open the actual local Astro post preview.";
    }
  } catch {
    previewAvailable = false;
  }
}

async function loadPosts() {
  try {
    const posts = await api("/api/posts");
    elements.postList.replaceChildren();
    if (!posts.length) {
      elements.postList.innerHTML = '<div class="empty-state">No posts found.</div>';
      return;
    }
    for (const post of posts) {
      const button = document.createElement("button");
      button.className = `post-item${post.file === activeFile ? " active" : ""}`;
      button.type = "button";
      button.innerHTML = `<strong>${escapeHtml(post.title)}</strong><small><span>${escapeHtml(post.published)}</span>${post.draft ? '<span class="draft-tag">DRAFT</span>' : ""}</small>`;
      button.addEventListener("click", () => openPost(post.file));
      elements.postList.append(button);
    }
  } catch (error) {
    elements.postList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function openPost(filename) {
  if (isDirty && !window.confirm("You have unsaved changes. Discard them and open another post?")) return;
  try {
    const post = await api(`/api/post?file=${encodeURIComponent(filename)}`);
    activeFile = post.file;
    setFieldValues(post);
    elements.workspaceTitle.textContent = post.title;
    setEditorTab("markdown");
    await loadPosts();
  } catch (error) {
    showToast(error.message, true);
  }
}

function startNewPost(monthly = false) {
  if (isDirty && !window.confirm("Discard the unsaved changes and start a new post?")) return;
  activeFile = null;
  const date = today();
  const now = new Date();
  const monthName = now.toLocaleString(undefined, { month: "long" });
  const template = monthly
    ? `Write your introduction here.\n\n::section[Game title]\n\nWrite your impressions here.\n\n::section[Closing thoughts]\n\nWrite your closing thoughts here.\n`
    : "";
  setFieldValues({
    title: monthly ? `Monthly update — ${monthName} ${now.getFullYear()}` : "",
    published: date,
    category: monthly ? "Monthly update" : "",
    description: "",
    image: "",
    tags: monthly ? ["Visual Novel"] : [],
    draft: true,
    body: template,
  });
  elements.workspaceTitle.textContent = monthly ? "New monthly update" : "New post";
  setEditorTab("markdown");
  loadPosts();
  elements.title.focus();
  showToast(monthly ? "Monthly update template ready." : "New post ready.");
}

async function savePost() {
  const payload = {
    file: activeFile,
    title: elements.title.value.trim(),
    published: elements.published.value,
    category: elements.category.value.trim(),
    description: elements.description.value.trim(),
    tags: elements.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    image: elements.cover.value.trim(),
    lang: elements.lang.value.trim(),
    draft: elements.draft.checked,
    body: elements.body.value,
  };
  elements.saveButton.disabled = true;
  elements.saveButton.textContent = "Saving…";
  try {
    const result = await api("/api/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    activeFile = result.file;
    elements.workspaceTitle.textContent = result.title;
    setDirty(false);
    await loadPosts();
    if (!elements.previewFrame.hidden) refreshPreview();
    showToast(`Saved ${result.file}`);
    return result;
  } catch (error) {
    showToast(error.message, true);
    return null;
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = isDirty ? "Save changes" : "Save post";
  }
}

function refreshPreview() {
  if (!activeFile || !previewAvailable) return;
  const slug = activeFile.replace(/\.md$/i, "").split("/").map(encodeURIComponent).join("/");
  elements.previewFrame.src = `${previewOrigin}/posts/${slug}/?editorPreview=${Date.now()}`;
}

async function openPreview() {
  if (!previewAvailable) {
    showToast("Live preview is unavailable. Run pnpm install and try again.", true);
    return;
  }
  if (isDirty || !activeFile) {
    const result = await savePost();
    if (!result) return;
  }
  const slug = activeFile.replace(/\.md$/i, "").split("/").map(encodeURIComponent).join("/");
  window.open(`${previewOrigin}/posts/${slug}/`, "_blank", "noopener,noreferrer");
}

function insertAtCursor(text, selectInserted = false) {
  const field = elements.body;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  field.setRangeText(text, start, end, "end");
  if (selectInserted) field.setSelectionRange(start, start + text.length);
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertBlock(text) {
  const field = elements.body;
  const before = field.value.slice(0, field.selectionStart);
  const after = field.value.slice(field.selectionEnd);
  const prefix = before.length && !before.endsWith("\n\n") ? before.endsWith("\n") ? "\n" : "\n\n" : "";
  const suffix = after.length && !after.startsWith("\n\n") ? after.startsWith("\n") ? "\n" : "\n\n" : "";
  insertAtCursor(`${prefix}${text}${suffix}`);
}

function formatSelection(before, after = before) {
  const field = elements.body;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const selected = field.value.slice(start, end) || "text";
  field.setRangeText(`${before}${selected}${after}`, start, end, "select");
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleToolbar(action) {
  if (action === "section") {
    const title = window.prompt("Heading text:", "Game title");
    if (title) insertBlock(`::section[${title.replace(/[\[\]\r\n]/g, " ")}]`);
  } else if (action === "game") {
    const title = window.prompt("Game title:", "Game title");
    if (title) insertBlock(`::section[${title.replace(/[\[\]\r\n]/g, " ")}]\n\nWrite your impressions here.`);
  } else if (action === "closing") {
    insertBlock("::section[Closing thoughts]\n\nWrite your closing thoughts here.");
  } else if (action === "spoiler") {
    const text = window.prompt("Text to hide:", "Spoiler text");
    if (text) insertBlock(`:spoiler[${text.replace(/\]/g, "&#93;")}]`);
  } else if (action === "image" || action === "spoiler-image" || action === "audio" || action === "video") {
    openMediaPicker(action);
  } else if (action === "bold") {
    formatSelection("**");
  } else if (action === "italic") {
    formatSelection("*");
  } else if (action === "link") {
    const url = window.prompt("Link URL:", "https://");
    if (url) {
      const label = window.prompt("Link text:", "Link");
      insertAtCursor(`[${label || url}](${url})`);
    }
  } else if (action === "quote") {
    const selected = elements.body.value.slice(elements.body.selectionStart, elements.body.selectionEnd) || "Quoted text";
    insertAtCursor(selected.split("\n").map((line) => `> ${line}`).join("\n"));
  } else if (action === "list") {
    const selected = elements.body.value.slice(elements.body.selectionStart, elements.body.selectionEnd) || "List item";
    insertAtCursor(selected.split("\n").map((line) => `- ${line}`).join("\n"));
  } else if (action === "html") {
    const html = window.prompt("HTML to insert:", '<div style="text-align: center;">Your HTML</div>');
    if (html) insertBlock(html);
  }
}

function openMediaPicker(mode) {
  mediaMode = mode;
  const titles = {
    cover: "Choose a cover image",
    image: "Insert an image",
    "spoiler-image": "Insert a spoiler image",
    audio: "Insert an audio file",
    video: "Insert a video file",
  };
  elements.mediaTitle.textContent = titles[mode] || "Choose media";
  elements.mediaSearch.value = "";
  elements.uploadInput.value = "";
  elements.uploadInput.accept = mode === "audio" ? "audio/*" : mode === "video" ? "video/*" : mode === "cover" || mode === "image" || mode === "spoiler-image" ? "image/*" : "image/*,audio/*,video/*";
  elements.mediaDialog.showModal();
  loadMedia();
}

function mediaMatchesMode(item) {
  if (mediaMode === "audio") return item.kind === "audio";
  if (mediaMode === "video") return item.kind === "video";
  return item.kind === "image";
}

function renderMedia() {
  const query = elements.mediaSearch.value.trim().toLowerCase();
  const items = mediaItems.filter((item) => mediaMatchesMode(item) && `${item.name} ${item.file}`.toLowerCase().includes(query));
  elements.mediaList.replaceChildren();
  if (!items.length) {
    elements.mediaList.innerHTML = '<div class="empty-state">No matching files. Upload one to get started.</div>';
    return;
  }
  for (const item of items) {
    const button = document.createElement("button");
    button.className = "media-card";
    button.type = "button";
    const thumb = item.kind === "image"
      ? `<div class="media-thumb"><img src="${escapeHtml(item.src)}" loading="lazy" alt=""></div>`
      : `<div class="media-thumb">${item.kind === "audio" ? "♫" : "▷"}</div>`;
    button.innerHTML = `${thumb}<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.file)}</small>`;
    button.addEventListener("click", () => chooseMedia(item));
    elements.mediaList.append(button);
  }
}

async function loadMedia() {
  elements.mediaList.innerHTML = '<div class="empty-state">Loading media…</div>';
  try {
    mediaItems = await api("/api/media");
    renderMedia();
  } catch (error) {
    elements.mediaList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function addMediaShortcode(item, optimized = {}) {
  const src = item.src;
  if (mediaMode === "cover") {
    elements.cover.value = src;
    elements.cover.dispatchEvent(new Event("input", { bubbles: true }));
    elements.mediaDialog.close();
    showToast("Cover image selected.");
    return;
  }
  if (mediaMode === "image" || mediaMode === "spoiler-image") {
    const caption = window.prompt(mediaMode === "spoiler-image" ? "Caption / reveal instruction:" : "Image caption (optional):", mediaMode === "spoiler-image" ? "Click to reveal spoiler" : "");
    const alt = window.prompt("Alt text (brief image description):", caption || "");
    const attrs = [`src=${quoteAttribute(src)}`, 'width="500"', `alt=${quoteAttribute(alt || caption || "")}`];
    if (caption) attrs.push(`caption=${quoteAttribute(caption)}`);
    if (optimized.srcset) attrs.push(`srcset=${quoteAttribute(optimized.srcset)}`);
    if (optimized.sizes) attrs.push(`sizes=${quoteAttribute(optimized.sizes)}`);
    insertBlock(`::${mediaMode === "spoiler-image" ? "nsfw" : "img"}{${attrs.join(" ")}}`);
  } else if (mediaMode === "audio") {
    const caption = window.prompt("Audio caption (optional):", "");
    const attrs = [`src=${quoteAttribute(src)}`];
    if (caption) attrs.push(`caption=${quoteAttribute(caption)}`);
    insertBlock(`::audio{${attrs.join(" ")}}`);
  } else if (mediaMode === "video") {
    const poster = window.prompt("Poster image path (optional, e.g. /files/editor/poster.webp):", "");
    const caption = window.prompt("Video caption (optional):", "");
    const attrs = [`src=${quoteAttribute(src)}`, 'width="800"'];
    if (poster) attrs.push(`poster=${quoteAttribute(poster)}`);
    if (caption) attrs.push(`caption=${quoteAttribute(caption)}`);
    insertBlock(`::video{${attrs.join(" ")}}`);
  }
  elements.mediaDialog.close();
}

async function chooseMedia(item, optimized = {}) {
  addMediaShortcode(item, optimized);
}

async function uploadSelectedFile(file) {
  if (!file) return;
  const name = encodeURIComponent(file.name);
  showToast(`Uploading ${file.name}…`);
  elements.uploadInput.disabled = true;
  try {
    const result = await api(`/api/upload?name=${name}`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    const item = { name: result.file, file: `editor/${result.file}`, src: result.src, kind: result.kind };
    if (mediaMode === "cover" || mediaMode === "image" || mediaMode === "spoiler-image") {
      chooseMedia(item, result);
    } else {
      chooseMedia(item, result);
    }
    showToast(`Uploaded ${result.file}`);
    await loadMedia();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.uploadInput.disabled = false;
    elements.uploadInput.value = "";
  }
}

for (const field of [elements.title, elements.published, elements.category, elements.description, elements.tags, elements.cover, elements.lang, elements.draft, elements.body]) {
  field.addEventListener("input", () => {
    setDirty(true);
    if (field === elements.body) updateWordCount();
    if (field === elements.title) elements.workspaceTitle.textContent = field.value || "New post";
  });
  field.addEventListener("change", () => setDirty(true));
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleToolbar(button.dataset.action));
});

$("#newPostButton").addEventListener("click", () => startNewPost(false));
$("#monthlyButton").addEventListener("click", () => startNewPost(true));
$("#saveButton").addEventListener("click", savePost);
$("#previewButton").addEventListener("click", openPreview);
$("#refreshPosts").addEventListener("click", loadPosts);
$("#chooseCover").addEventListener("click", () => openMediaPicker("cover"));
$("#clearCover").addEventListener("click", () => { elements.cover.value = ""; setDirty(true); });
$("#closeMedia").addEventListener("click", () => elements.mediaDialog.close());
elements.mediaSearch.addEventListener("input", renderMedia);
elements.uploadInput.addEventListener("change", (event) => uploadSelectedFile(event.target.files?.[0]));
elements.markdownTab.addEventListener("click", () => setEditorTab("markdown"));
elements.previewTab.addEventListener("click", () => {
  if (!activeFile) {
    showToast("Save the post before opening its preview.", true);
    return;
  }
  setEditorTab("preview");
});

document.addEventListener("keydown", async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    await savePost();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function init() {
  await loadStatus();
  if (!previewAvailable) {
    elements.previewButton.title = "Waiting for the local Astro preview server…";
    previewStatusTimer = setInterval(loadStatus, 2000);
  }
  await loadPosts();
  setFieldValues({ published: today(), draft: true, body: "" });
}

init();
