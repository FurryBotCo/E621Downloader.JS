import c from "/home/donovan/Documents/E621Downloader/cache.json";
for (const d of c.data) {
	if (!d.tags) console.log(d);
}
