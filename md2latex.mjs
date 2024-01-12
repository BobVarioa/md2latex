#!/usr/bin/node
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkCodeFrontmatter from "remark-code-frontmatter";
import { unified } from "unified";
import fs from "node:fs";
import { matter } from "vfile-matter";
import remarkGfm from "remark-gfm";
import YAML from "yaml";

const input = fs.readFileSync(process.argv[2], "utf8");
const template = fs.readFileSync(process.argv[3], "utf-8");

const file = await unified()
	.use(remarkParse)
	.use(remarkStringify)
	.use(remarkMath)
	.use(remarkCodeFrontmatter)
	.use(remarkFrontmatter, ["yaml", "toml"])
	.use(remarkGfm)
	.use(() => toLatexPlugin)
	.process(input);

function getYaml(node) {
	if (node.type != "yaml") throw new Error("no frontmatter");
	return YAML.parse(node.value);
}

function parseCode(node) {
	const front = node.frontmatter;
	switch (node.lang) {
		case "figure": {
			let str = "\\begin{figure}\n";
			str += node.value + "\n";
			if (front.label) {
				str += `\\label{fig:${front.label}}\n`;
			}
			if (front.caption) {
				str += `\\caption{${front.caption}}\n`;
			}
			str += "\\end{figure}\n";
			return str;
		}
		case "csv": {
			// render table
			let str = `\\begin{table}\n\\centering\\begin{tabular}{${front.alignment}}`;

			str += node.value
				.split("\n")
				.map((v, i) => {
					let ret = v.replaceAll("&", "\\&").replaceAll(",", "&");
					if (i == 1) return `\\hline\n${ret}`;
					return ret;
				})
				.join("\\\\");

			str += "\\end{tabular}";
			if (front.label) {
				str += `\\label{tab:${front.label}}\n`;
			}
			if (front.caption) {
				str += `\\caption{${front.caption}}\n`;
			}
			str += "\\end{table}";

			return str;
		}

		case "":
			// default format
			return "";

		default:
			throw new Error("unknown");
	}
}

function parseImage(node) {
	switch (node.url.slice(node.url.lastIndexOf(".") + 1)) {
		case "bib":
			return "";
		case "csv":
			return "";
		case "png":
		case "jpg":
		case "jpeg":
			let str = `\\begin{figure}\n\\centering\n\\includegraphics[width=0.25\\linewidth]{${node.url}}\n`;
			if (node.alt) {
				str += `\\caption{${node.alt}}\n`;
			}
			str += "\\end{figure}\n";
			return str;
	}
}

function toLatex(node) {
	switch (node.type) {
		case "paragraph":
		case "listItem":
		case "root": {
			let str = "";
			for (const n of node.children) {
				str += toLatex(n);
			}
			return str;
		}
		case "heading":
			let str = "";
			for (const n of node.children) {
				str += toLatex(n);
			}
			if (node.depth > 1) return `\\subsection{${str}}\n`;
			return `\\section{${str}}\n`;
		case "text":
			return node.value;
		case "link": {
			let str = "";
			for (const n of node.children) {
				str += toLatex(n);
			}
			return `\\href{${node.url}}{${str}}`;
		}
		case "list": {
			let str = node.ordered ? "\\begin{enumerate}\n" : "\\begin{itemize}\n" ;
			for (const n of node.children) {
				str += `\\item{${toLatex(n)}}\n`;
			}
			str += node.ordered ? "\\end{enumerate}\n" : "\\end{itemize}\n";
			return str;
		}
		case "inlineMath":
			return `$${node.value}$`;
		case "math":
			return `\[${node.value}\]`;
		case "inlineCode":
			return `\\verb|${node.value}|`
		case "code":
			return parseCode(node);
		case "html":
			return "";
		case "image":
			return parseImage(node);
		default:
			throw new Error("unknown");
	}
}

/**
 * @param {import('mdast').Root} tree
 */
function toLatexPlugin(tree, file) {
	matter(file);
	let frontmatter = getYaml(tree.children.shift());

	let temp = template.replaceAll(/\%(\w+)\%/g, (match, p1) => {
		switch (p1) {
			case "body":
				return toLatex(tree);
			default:
				return frontmatter[p1];
		}
	});

	console.log(temp);
}
