import * as fs from "fs-extra";
import { Cache } from "../src/util/CacheManager";

const v: Cache = fs.readJSONSync("/home/donovan/Documents/E621Downloader/cache/main.json");

v.data = v.data.map(v => ({
	...v,
	tags: v.tags.map(t => t.toLowerCase())
})).sort((a, b) => a.tags[0] < b.tags[0] ? -1 : a.tags[0] > b.tags[0] ? 1 : 0);
console.log("total tags:", v.data.length);
const j = fs.readdirSync("/home/donovan/Documents/E621Downloader/Files");
const c = v.data.map(v => v.lastFolder);
for (const a of j) if (!c.includes(a)) console.log(a);

fs.writeJSONSync("/home/donovan/Documents/E621Downloader/cache.json", v);
