// Shortcodes turn compact ::directives into the custom HTML used by the blog.
//
//   ::section[Title]
//   ::img{src="/files/example.png" caption="optional"}
//   ::nsfw{src="/files/example.png" caption="Click to reveal spoiler"}
//   ::audio{src="/files/example.mp3" caption="optional"}
//   ::video{src="/files/example.mp4" poster="/files/poster.webp"}
//
// Bare filenames are resolved inside /files/. Existing :spoiler[...] syntax
// is intentionally left untouched.

const esc = (value = "") =>
	String(value)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const resolve = (src = "") =>
	/^(https?:)?\/\//.test(src) || src.startsWith("/") ? src : `/files/${src}`;

const caption = (text, margin = "0") =>
	text
		? `\n<p style="text-align: center; font-size: 0.85rem; color: #888; margin-top: ${margin};">${esc(text)}</p>`
		: "";

const textOf = (node) =>
	node.type === "text" ? node.value : (node.children || []).map(textOf).join("");

const html = (value) => ({ type: "html", value });

const imageAttributes = (a) => {
	const srcset = a.srcset ? ` srcset="${esc(a.srcset)}"` : "";
	const sizes = a.sizes ? ` sizes="${esc(a.sizes)}"` : "";
	return `${srcset}${sizes}`;
};

const builders = {
	// Keep this as a real heading so the table of contents and anchors work.
	section: (_attributes, label) => ({
		type: "heading",
		depth: 2,
		children: [{ type: "text", value: label }],
		data: { hProperties: { style: "text-align: center;" } },
	}),

	img: (a) =>
		html(
			`<img src="${esc(resolve(a.src))}" width="${esc(a.width || 500)}" style="display: block; margin: 24px auto; max-width: 100%;" alt="${esc(a.alt || a.caption || "")}" loading="lazy" decoding="async"${imageAttributes(a)} />${caption(a.caption)}`,
		),

	// The first click reveals the image; the next click opens PhotoSwipe.
	nsfw: (a) =>
		html(
			`<div style="text-align: center; margin: 16px auto;">
	<img
		class="spoiler-image"
		src="${esc(resolve(a.src))}"
		width="${esc(a.width || 500)}"
		style="display: block; margin: 0 auto; max-width: 100%;"
		alt="${esc(a.alt || a.caption || "Spoiler image")}"
		loading="lazy"
		decoding="async"${imageAttributes(a)}
	/>
	<p style="font-size: 0.8rem; color: #888;">${esc(a.caption || "Click to reveal spoiler")}</p>
</div>`,
		),

	audio: (a) =>
		html(
			`<audio controls preload="none" style="display: block; margin: 20px auto; max-width: 100%;">
	<source src="${esc(resolve(a.src))}">
	Your browser does not support the audio element.
</audio>${caption(a.caption, "4px")}`,
		),

	video: (a) => {
		const poster = a.poster ? ` poster="${esc(resolve(a.poster))}"` : "";
		return html(
			`<video controls preload="none" playsinline width="${esc(a.width || 800)}"${poster} style="display: block; margin: 20px auto; max-width: 100%; height: auto;">
	<source src="${esc(resolve(a.src))}">
	Your browser does not support the video element.
</video>${caption(a.caption, "4px")}`,
		);
	},
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
