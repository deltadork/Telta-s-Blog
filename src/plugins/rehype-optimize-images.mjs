/**
 * Apply safe loading defaults to images rendered from Markdown/MDX.
 * Responsive srcsets for existing local article images are generated in
 * public/generated; this plugin also covers future Markdown image elements.
 */
import { visit } from "unist-util-visit";

export function rehypeOptimizeImages() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "img") return;

      node.properties ??= {};
      node.properties.loading ??= "lazy";
      node.properties.decoding ??= "async";
    });
  };
}
