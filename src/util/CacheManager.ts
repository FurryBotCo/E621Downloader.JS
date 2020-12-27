import * as fs from "fs-extra";
import E621Downloader from "..";
import JSON5 from "json5";

export interface Cache {
	version: typeof CacheManager["VERSION"];
	data: {
		tags: string[];
		lastDownloaded: number;
		lastFolder: string;
		posts: {
			id: number;
			md5: string;
		}[];
	}[];
}

class OwOError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "OwOError";
	}
}

export default class CacheManager {
	static VERSION = 1 as const;
	file: string;
	constructor(file: string) {
		this.file = file;
	}

	get() {
		if (!this.file) throw new TypeError("Invalid cache file.");
		let o: Cache, v;
		try {
			v = fs.readFileSync(this.file).toString();
			o = JSON5.parse(v);
			if (typeof o.version !== "number") throw new OwOError("OwO *notices your invalid cache file*");
		} catch (e) {
			console.error("Error parsing cache file:", e);
			if (fs.existsSync(this.file)) fs.renameSync(this.file, `${this.file}-${Date.now()}.old`);
			let d: Cache["data"];
			// this assumes the file is using the old `{ key: string[] }` format
			if (e instanceof OwOError && o!) d = Object.keys(o as any).map(v => ({
				tags: v.split(" "),
				lastDownloaded: 0, // we could *maybe* figure this out but it's easier to just not
				lastFolder: E621Downloader.sanitizeFolderName(v.split(" ")[0]), // we make it the tags because we don't know what it was
				posts: [] // we throw away old posts because we don't have the md5
			}));
			o = {
				version: 1,
				data: d! ?? []
			};
			fs.writeFileSync(this.file, JSON.stringify(o, null, "\t"));
		}

		return o;
	}

	update(tags: string[] | string, posts: Cache["data"][number]["posts"], folder: string) {
		if (Array.isArray(tags)) tags = tags.join(" ");
		const c = this.get();
		const j = c.data.find(v => v.tags.join(" ") === tags);
		// if (j) c.data.splice(c.data.indexOf(j), 1);
		const v = j || {
			tags: tags.split(" "),
			lastDownloaded: 0,
			lastFolder: folder,
			posts: []
		};
		v.lastDownloaded = Date.now();
		v.lastFolder = folder;
		v.posts = this.unique(...[
			...v.posts,
			...posts
		]);
		c.data[c.data.indexOf(j!) ?? c.data.length] = v;
		fs.writeFileSync(this.file, JSON.stringify(c, null, "\t"));
	}



	unique<T>(...v: T[]): T[] {
		// we have to stringify & parse because of objects and such
		return Array.from(new Set(v.map(j => JSON.stringify(j)))).map(v => JSON5.parse(v));
	}
}