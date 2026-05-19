const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

/**
 * Downloads wallpapers from wallhaven.cc
 * @param {string} query - the search query
 * @param {string} [ratio] - the aspect ratio of the wallpapers to retrieve. Available values are "mobile" and "desktop". If not provided, all wallpapers will be retrieved.
 * @returns {Promise<string[]>} An array of URLs of the wallpapers.
 */
async function getWallpaper(query, ratio = false) {

    const url = `https://wallhaven.cc/search?q=${encodeURIComponent(query)}` + (ratio ? "&ratios=" + (ratio == "mobile" ? "portrait" : "") : "");
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    var list = $(".thumb-listing-page").prop('outerHTML')

    const dataSrcLinks = [];

    $('img.lazyload').each((i, element) => {
        const dataSrc = $(element).attr('data-src');
        if (dataSrc) {
            let fullRes = dataSrc.replace("th.wallhaven.cc/small", "w.wallhaven.cc/full");
            let lastSlashIndex = fullRes.lastIndexOf("/");
            let filename = fullRes.substring(lastSlashIndex + 1);
            fullRes = fullRes.substring(0, lastSlashIndex + 1) + "wallhaven-" + filename;
            dataSrcLinks.push(fullRes);
        }
    });

    return dataSrcLinks;
}

/**
 * Downloads wallpapers from wallspic.com
 * @param {string} query - the search query
 * @param {string} [ratio] - the aspect ratio of the wallpapers to retrieve. Available values are "mobile" and "desktop". If not provided, all wallpapers will be retrieved.
 * @returns {Promise<string[]>} An array of URLs of the wallpapers.
 */
async function getWallpaperv2(query, ratio = false) {
    var url = "https://wallspic.com/search/" + encodeURIComponent(query) + (ratio ? ratio ==  "mobile" ? "/for_mobile" : "" : "");
    var response = await axios.get(url);
    response = response.data;

    if (!response.includes('<script type="application/ld+json">')) {
        return [];
    }

    const $ = cheerio.load(response);

    const scriptEtiketleri = $('script[type="application/ld+json"]');
    const ucuncuScriptEtiketi = scriptEtiketleri.eq(2);
    const jsonData = JSON.parse(ucuncuScriptEtiketi.text());

    var urls = [];
    if (Array.isArray(jsonData)) {
        jsonData.forEach(item => {
            if (item.contentUrl) {
                urls.push(item.contentUrl);
            }
        });
    }

    return urls;
}

addCommand({ pattern: "^wp ?(.*)", access: "all", desc: "_Get wallpapers of a query._", pluginVersion: "1.0.0", pluginId: "wallpaper"}, async (msg, match, sock, rawMessage) => {
    var query = match[1];
    if (!query) {
        var example = "\n_Example:_ ```" + global.handlers[0] + "wp <query> <model> <ratio>```\n\n_Models: <-v1 || -v2>_\n_Ratios: <-mobile>_\n\n_V2 provides high resolution wallpapers, V1 provides more type of wallpapers!_";
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a query to search for._" + example, edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a query to search for._" + example}, { quoted: rawMessage.messages[0] });
        }
    }

    var model = query.includes("-v2") ? "-v2" : "-v1";
    var ratio = query.includes("-mobile") ? "mobile" : false;
    query = query.replace("-v2", "").replace("-v1", "").replace("-mobile", "")
    query = query.trimEnd().trimStart();

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_🖼️ Searching for wallpapers..._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_🖼️ Searching for wallpapers..._" }, { quoted: rawMessage.messages[0] });
    }

    var images;

    if (model == "-v2") {
        images = await getWallpaperv2(query, ratio);
    } else {
        images = await getWallpaper(query, ratio);
    }

    if (images.length == 0) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ No wallpapers found._", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ No wallpapers found._", edit: publicMessage.key });
        }
    }

    /**
     * Sends a random image from the list of images to the given JID
     * @returns {Promise<string>} The path to the saved image
     */
    async function sendRandomImage() {
        var randomImage = images[Math.floor(Math.random() * images.length)];
        var mediaPath = "./src/wallpaper_" + Math.floor(Math.random() * 20) + ".jpg";
        try {
            var image = await axios.get(randomImage, { responseType: 'arraybuffer' });
        } catch {
            return await sendRandomImage();
        }

        fs.writeFileSync(mediaPath, image.data);
        var caption = "_🖼️ Wallpaper (" + query + ")_\n" + "_Model ::_ " + model.toUpperCase().replace("-", "") + "\n_Ratio ::_ " + (ratio ? "Mobile" : "Desktop");
        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key.fromMe ? msg.key : publicMessage.key });
        await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaPath}, caption: caption });
        return mediaPath
    }

    var getFilee = await sendRandomImage();
    try { fs.unlinkSync(getFilee); } catch { }
    return;
})