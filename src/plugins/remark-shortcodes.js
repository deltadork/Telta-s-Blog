// Shortcodes: turn short ::tags into the long HTML you used to type by hand.
//   ::section[Title]
//   ::img{src="pic.png" caption="optional"}
//   ::nsfw{src="pic.png"}
//   ::audio{src="song.mp3" caption="optional"}
//   ::video{src="clip.mp4"}
// A bare filename (no leading / or http) is looked up in /files/.
// Existing :spoiler[...] and the admonitions are not touched.

const esc = (s = "") =>
	String(s)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const resolve = (src = "") =>
	/^(https?:)?\/\//.test(src) || src.startsWith("/") ? src : `/files/${src}`;

const caption = (text) =>
	text
		? `\n<p style="text-align: center; font-size: 0.85rem; color: #888; margin-top: 0;">${esc(text)}</p>`
		: "";

const textOf = (node) =>
	node.type === "text" ? node.value : (node.children || []).map(textOf).join("");

const html = (value) => ({ type: "html", value });

const builders = {
	// real heading node, so the table of contents and anchors keep working
	section: (_a, label) => ({
		type: "heading",
		depth: 2,
		children: [{ type: "text", value: label }],
		data: { hProperties: { style: "text-align: center;" } },
	}),

	img: (a) =>
		html(
			`<img src="${esc(resolve(a.src))}" width="${esc(a.width || 500)}" style="display: block; margin: 24px auto; max-width: 100%;" alt="${esc(a.alt || a.caption || "")}" />${caption(a.caption)}`,
		),

	// blurred image, click to reveal
	nsfw: (a) =>
		html(
			`<div style="text-align: center; margin: 16px auto;">
  <img src="${esc(resolve(a.src))}" width="${esc(a.width || 500)}"
       style="display: block; margin: 0 auto; max-width: 100%; filter: blur(20px); cursor: pointer; transition: filter 0.3s;"
       onclick="event.stopPropagation(); event.preventDefault(); this.style.filter = this.style.filter === 'none' ? 'blur(20px)' : 'none';" />
  <p style="font-size: 0.8rem; color: #888;">${esc(a.caption || "Click to reveal spoiler")}</p>
</div>`,
		),

	audio: (a) =>
		html(
			`<audio controls style="display: block; margin: 20px auto;">
  <source src="${esc(resolve(a.src))}" type="audio/mpeg">
  Your browser does not support the audio element.
</audio>${caption(a.caption)}`,
		),

	video: (a) =>
		html(
			`<video controls style="display: block; margin: 20px auto; max-width: 100%; width: 500px;"><source src="${esc(resolve(a.src))}" type="video/mp4">Your browser does not support the video tag.</video>${caption(a.caption)}`,
		),
};

function walk(node) {
	if (!node.children) return;
	node.children = node.children.map((child) => {
		if (child.type === "leafDirective" && builders[child.name]) {
			return builders[child.name](child.attributes || {}, textOf(child));
		}
		walk(child);
		return child;
	});
}

export function remarkShortcodes() {
	return (tree) => walk(tree);
}
