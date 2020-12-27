const E621Downloader = require("../build/src");
const fs = require("fs-extra");
const e = new E621Downloader({
	useCache: true,
	cacheFile: "/home/donovan/FurryThings/E621Downloader/cache.json",
	saveDirectory: "/home/donovan/FurryThings/E621Downloader"
});

console.log(e.cache.get());
