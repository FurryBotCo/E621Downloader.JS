import CacheConverter from "./CacheConverter";
import E621Downloader from "..";
import * as fs from "fs-extra";
import { EventEmitter } from "tsee";
import { v4 as uuid } from "uuid";
import path from "path";

export interface Cache {
	version: typeof CacheManager["VERSION"];
	data: Array<{
		id: string;
		tags: Array<string>;
		lastDownloaded: number;
		lastFolder: string;
	}>;
}

export interface CachePostWithoutInfo {
	id: number;
	// may be undefined or null on legacy
	ext: string;
	md5: string;
	info: null;
}

export interface CachePostWithInfo {
	id: number;
	// may be undefined or null on legacy
	ext: string;
	md5: string;
	info: {
		fav: number;
		score: number;
		rating: "s" | "q" | "e";
		sources: Array<string>;
		tags: Array<string>;
	};
}

export type CachePost = CachePostWithoutInfo | CachePostWithInfo;

class OwOError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "OwOError";
	}
}

export default class CacheManager extends EventEmitter<{
	"error": (err: Error | string, extra?: unknown, threadId?: number) => void;
	"warn": (info: string, threadId?: number) => void;
	"debug": (info: string, threadId?: number) => void;
}> {
	static VERSION = 3 as const;
	folder: string;
	minify: boolean;
	autoConvert: boolean;
	constructor(folder: string, minify = true, autoConvert = true) {
		super();
		if (!folder) throw new TypeError("Invalid cache folder.");
		this.folder = folder;
		if (!fs.existsSync(this.folder)) fs.mkdirpSync(this.folder);
		if (!fs.existsSync(this.loc("data"))) fs.mkdirpSync(this.loc("data"));
		this.minify = !!(minify ?? true);
		this.autoConvert = !!(autoConvert ?? true);
	}

	static loc(type: "main" | "data", folder: string) {
		switch (type) {
			case "main": return `${folder}/main.json`;
			case "data": return `${folder}/data`;
		}
	}

	loc(type: "main" | "data"): string;
	loc(type: "tags", tags: Array<string>): string | undefined;
	loc(type: "main" | "data" | "tags", tags?: Array<string>) {
		switch (type) {
			case "main": return `${this.folder}/main.json`;
			case "data": return `${this.folder}/data`;
			case "tags": {
				tags = tags!.map((t) => t.toLowerCase().trim());
				const id = this.get().data.find((v) => v.tags.join(" ") === tags!.join(""))?.id;
				if (!id) return undefined;
				else return `${this.loc("data")}/${id}.json`;
			}
		}
	}

	get(fix = true): Cache {
		let o: Cache, v: number;
		try {
			o = fs.readJSONSync(this.loc("main")) as Cache;
			if (typeof o.version !== "number") throw new OwOError("OwO *notices your invalid cache file*");
			v = o.version;
			// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
			if (o.version !== CacheManager.VERSION) throw new TypeError(`Unsupported cache file version: ${o.version}`);
		} catch (e) {
			if ((e as Error).message.indexOf("file version") !== -1) {
				if (this.autoConvert) {
					this.emit("warn", `The cache file version ${v!} is no longer supported. We're attempting to automatically convert it for you..`);
					CacheConverter.fromUnknown(path.resolve(`${this.loc("data")}/../`));
					return this.get(fix);
				} else {
					this.emit("warn", `The cache file version ${v!} is no longer supported. Your cache file has been moved, and has been replaced with a fresh, empty version.`);
					const d = Date.now();
					fs.renameSync(this.loc("main"), `${this.loc("main").replace(/\.json/, "")}-${d}.unsupported.json`);
					if (fs.existsSync(this.loc("data"))) fs.renameSync(this.loc("data"), `${this.loc("data")}.${d}.unsupported`);
					fs.mkdirpSync(this.loc("data"));
				}
			} else if ((e as Error).message.indexOf("ENOENT") !== -1) this.emit("warn", "Cache file does not exist, creating it..");
			else console.error("Error parsing cache file:", e);
			if (fs.existsSync(this.loc("main"))) fs.renameSync(this.loc("main"), `${this.loc("main").replace(/\.json/, "")}-${Date.now()}.error.json`);
			let d: Cache["data"];
			// this assumes the file is using the old `{ key: string[] }` format
			if (e instanceof OwOError && o!) {
				d = Object.keys(o).map((t) => {
					const id = uuid();
					fs.writeFileSync(`${this.loc("data")}/${id}.json`, "[]");
					return {
						id,
						tags: t.split(" "),
						lastDownloaded: 0, // we could *maybe* figure this out but it's easier to just not
						lastFolder: E621Downloader.sanitizeFolderName(t.split(" ")[0]) // we make it the tags because we don't know what it was
					};
				});
			}

			o = {
				version: CacheManager.VERSION,
				data: d! ?? []
			};
			// if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, "");
			const fd = fs.openSync(this.loc("main"), "w+");
			fs.writeFileSync(fd, JSON.stringify(o, null, this.minify ? "" : "\t"));
			fs.fsyncSync(fd);
			fs.closeSync(fd);
		}

		if (fix === true) this.fixTags(o);

		return o;
	}

	getTagsInstance(tags: Array<string>, lastFolder: string) {
		tags = tags.map((t) => t.toLowerCase().trim());
		const id = uuid(),
			j = {
				id,
				tags,
				lastDownloaded: 0,
				lastFolder
			},
			c = this.get(),
			g = c.data.find((v) => v.tags.join(" ") === tags.join(" "));
		if (g) return g;
		c.data.push(j);
		const fd = fs.openSync(this.loc("main"), "w+");
		fs.writeFileSync(fd, JSON.stringify(c, null, this.minify ? "" : "\t"));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		return j;
	}

	update(tags: Array<string>, posts: Array<CachePost>, folder: string) {
		tags = tags.map((t) => t.toLowerCase().trim());
		if (!tags || tags.length === 0 || tags.join(" ").trim().length === 0) {
			const e = new Error("[CacheManager] Zero tag cache update recieved.");
			this.emit("error", e);
			throw e;
			return;
		}

		const c = this.get(),
			o = JSON.parse(JSON.stringify(c)) as typeof c,
			j = c.data.find((v) => v.tags.join(" ") === tags.join(" ")),
			// if (j) c.data.splice(c.data.indexOf(j), 1);
			v = this.getTagsInstance(tags, folder);
		v.lastFolder = folder;
		this.updatePosts(posts, tags);
		let i: number;
		if (j) {
			i = c.data.indexOf(j);
			c.data[c.data.indexOf(j)] = v;
		} else i = (c.data.push(v)) - 1;
		// just in case
		c.data = this.uniqueOverall(...c.data);
		c.data[i].lastDownloaded = Date.now();
		// don't touch the file if we don't need to
		if (JSON.stringify(c) === JSON.stringify(o)) {
			this.emit("debug", "[CacheManager/updateMain] Skipping file write due to no changes");
			return;
		}
		const fd = fs.openSync(this.loc("main"), "w+");
		fs.writeFileSync(fd, JSON.stringify(c, null, this.minify ? "" : "\t"));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
	}

	getPosts(tags: Array<string>) {
		tags = tags.map((t) => t.toLowerCase().trim());
		const loc = this.loc("tags", tags);
		if (!loc) throw new TypeError(`Unable to determine cache location for tag(s) "${tags.join(" ")}"`);
		if (!fs.existsSync(loc)) {
			this.emit("warn", `cache file for tag(s) "${tags.join(" ")}" (${loc}) does not exist, creating it.`);
			fs.writeFileSync(loc, "[]");
		}
		const v = fs.readFileSync(loc).toString();
		let d: Array<CachePost>;
		try {
			d = JSON.parse(v) as typeof d;
		} catch (e) {
			fs.moveSync(loc, `${loc}.old`);
			this.emit("error", `Cache file "${loc}" could not be parsed, moving it and starting fresh.`);
			fs.writeFileSync(loc, "[]");
			return [];
		}

		return d;
	}

	updatePosts(posts: Array<CachePost>, tags: Array<string>): void {
		const loc = this.loc("tags", tags);
		if (!loc) throw new TypeError(`Unable to determine cache location for tag(s) "${tags.join(" ")}"`);
		const d = this.getPosts(tags),
			j = this.uniquePosts(...[
				...d,
				...posts
			]);
		if (JSON.stringify(d) === JSON.stringify(j)) {
			this.emit("debug", "[CacheManager/updatePosts] Skipping file write due to no changes");
			return;
		}

		const fd = fs.openSync(loc, "w+");
		fs.writeFileSync(fd, JSON.stringify(j, null, this.minify ? "" : "\t"));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		return;
	}

	uniqueOverall<T>(...v: Array<T>): Array<T> {
		// eslint-disable-next-line
		if (Array.isArray(v[0])) v = [...(v as any)[0]];
		// we have to stringify & parse because of objects and such
		// eslint-disable-next-line
		return Array.from(new Set(v.map((j) => JSON.stringify(j))).values()).map((v) => JSON.parse(v));
	}

	uniquePosts<T extends { id: number; }>(...v: Array<T>): Array<T> {
		// eslint-disable-next-line
		if (Array.isArray(v[0])) v = [...(v as any)[0]];
		// we have to stringify & parse because of objects and such
		// eslint-disable-next-line
		const arr: Array<T> = Array.from(new Set(v.map((j) => JSON.stringify(j))).values()).map((v) => JSON.parse(v)),
			id: Array<{ n: number; pos: number; }> = [];
		// we have to walk through it to remove instances that have changed slightly
		for (const p of arr) {
			const j = id.map((k) => k.n),
				b = arr.indexOf(p);
			if (j.includes(p.id)) {
				const a = id.find((l) => l.n === p.id)!.pos,

					c = JSON.stringify(arr[a]),
					d = JSON.stringify(arr[b]);

				// prefer the longer one since it's likely newer
				if (c.length > d.length) arr.splice(b, 1);
				else arr.splice(a, 1);
			} else {
				id.push({
					n: p.id,
					pos: b
				});
			}
		}

		return arr;
	}

	isCached(id: number, tags: Array<string>) {
		tags = tags.map((t) => t.toLowerCase().trim());
		const c = this.getPosts(tags);
		return c.map((v) => v.id).includes(id);
	}

	// lowercase & trim
	fixTags(c?: Cache) {
		if (c === undefined) c = this.get();
		const b: Cache = {
			...c
		};

		c.data.map((v, i) => {
			const t = v.tags.map((tt) => tt.toLowerCase().trim());
			if (v.tags.join(" ") !== t.join(" ")) c!.data[i].tags = t;
		});

		if (JSON.stringify(c) !== JSON.stringify(b)) {
			this.emit("debug", "[CacheManager/fixTags] Skipping file write due to no changes");
			return;
		}

		const fd = fs.openSync(this.loc("main"), "w+");
		fs.writeFileSync(fd, JSON.stringify(b, null, this.minify ? "" : "\t"));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
	}
}
