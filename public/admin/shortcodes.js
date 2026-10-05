// Toolbar buttons in the editor. Each one writes the ::shortcode line.
const clean = (s) => String(s || "").replace(/"/g, "'");
const cap = (s) => (s ? ` caption="${clean(s)}"` : "");

function add(def) {
  if (window.CMS) window.CMS.registerEditorComponent(def);
}

add({
  id: "sc-section",
  label: "Section heading",
  fields: [{ name: "title", label: "Title", widget: "string" }],
  pattern: /^::section\[([^\]]*)\]$/,
  fromBlock: (m) => ({ title: m[1] }),
  toBlock: (d) => `::section[${d.title}]`,
  toPreview: (d) => `<h2 style="text-align:center">${d.title}</h2>`,
});

add({
  id: "sc-img",
  label: "Image",
  fields: [
    { name: "src", label: "Image", widget: "image" },
    { name: "caption", label: "Caption (optional)", widget: "string", required: false },
  ],
  pattern: /^::img\{src="([^"]*)"(?: caption="([^"]*)")?\}$/,
  fromBlock: (m) => ({ src: m[1], caption: m[2] || "" }),
  toBlock: (d) => `::img{src="${d.src}"${cap(d.caption)}}`,
  toPreview: (d) => `<img src="${d.src}" style="max-width:300px">`,
});

add({
  id: "sc-nsfw",
  label: "NSFW image (blurred)",
  fields: [{ name: "src", label: "Image", widget: "image" }],
  pattern: /^::nsfw\{src="([^"]*)"\}$/,
  fromBlock: (m) => ({ src: m[1] }),
  toBlock: (d) => `::nsfw{src="${d.src}"}`,
  toPreview: (d) => `<img src="${d.src}" style="max-width:300px;filter:blur(12px)">`,
});

add({
  id: "sc-audio",
  label: "Audio",
  fields: [
    { name: "src", label: "MP3 file", widget: "file" },
    { name: "caption", label: "Caption (optional)", widget: "string", required: false },
  ],
  pattern: /^::audio\{src="([^"]*)"(?: caption="([^"]*)")?\}$/,
  fromBlock: (m) => ({ src: m[1], caption: m[2] || "" }),
  toBlock: (d) => `::audio{src="${d.src}"${cap(d.caption)}}`,
  toPreview: (d) => `<audio controls src="${d.src}"></audio>`,
});

add({
  id: "sc-video",
  label: "Video",
  fields: [
    { name: "src", label: "MP4 file", widget: "file" },
    { name: "caption", label: "Caption (optional)", widget: "string", required: false },
  ],
  pattern: /^::video\{src="([^"]*)"(?: caption="([^"]*)")?\}$/,
  fromBlock: (m) => ({ src: m[1], caption: m[2] || "" }),
  toBlock: (d) => `::video{src="${d.src}"${cap(d.caption)}}`,
  toPreview: (d) => `<video controls src="${d.src}" style="max-width:300px"></video>`,
});
