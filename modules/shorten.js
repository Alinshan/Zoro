const axios = require("axios");
const formData = require("form-data");

/**
 * Shorten a given URL using spoo.me
 * @param {string} url
 * @returns {string} shortened url
 */
async function shortenUrl(url) {
    var form = new formData();
    form.append("url", url);
    form.append("alias", "");
    form.append("password", "");
    form.append("max-clicks", "");
    form.append("block-bots", "on");
    var shorten = await axios({
        url: "https://spoo.me/",
        method: "POST",
        headers: form.getHeaders(),
        data: form
    })
    return shorten.data.match(/target="_blank" id="short-url">(.*?)<\/a>/)[1]
}
/**
 * Get the data of a shortened URL using spoo.me
 * @param {string} url the shortened URL
 * @returns {Object} the data of the shortened URL
 */
async function getData(url) {
    // url: https://spoo.me/1LaaYn
    url = url.split(".me/")[1]
    var data = await axios({
        url: "https://spoo.me/export/" + url + "/json?password=None",
        method: "GET",
        responseType: "json"
    })
    return data.data
}

addCommand({ pattern: "^shorten ?(.*)", access: 'all', desc: '_Shorten a URL._', pluginVersion: "1.0.0", pluginId: "shorten"}, async (msg, match, sock, rawMessage) => {
    const url = match[1];
    if (!url) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a URL to shorten._', edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a URL to shorten._'}, { quoted: rawMessage.messages[0] });
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: '_Shortening URL..._', edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: '_Shortening URL..._'}, { quoted: rawMessage.messages[0] });
    }
    try {
        var shortUrl = await shortenUrl(url);
        shortUrl = "_Url Shortened: " + shortUrl + "_";
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: shortUrl, edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: shortUrl , edit: publicMessage.key });
        }
    } catch (error) {
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: '_❌ An error occurred while shortening the URL._', edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: '_❌ An error occurred while shortening the URL._', edit: publicMessage.key });
        }
    }
    return;
});

addCommand({ pattern: "^shortendata ?(.*)", access: 'all', desc: '_Get data of a short url._', pluginVersion: "1.0.0", pluginId: "shorten"}, async (msg, match, sock, rawMessage) => {
    const url = match[1];
    if (!url) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a short URL to shorten._', edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a short URL to shorten._'}, { quoted: rawMessage.messages[0] });
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: '_Getting data..._', edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: '_Getting data..._'}, { quoted: rawMessage.messages[0] });
    }

    try {
        var shortUrl = await getData(url);
        var mostUsedBrowser = Object.keys(shortUrl.browser).sort((a, b) => shortUrl.browser[b] - shortUrl.browser[a])[0];
        var mostUsedOS = Object.keys(shortUrl.os_name).sort((a, b) => shortUrl.os_name[b] - shortUrl.os_name[a])[0];
        var mostVisistedCountry = Object.keys(shortUrl.country).sort((a, b) => shortUrl.country[b] - shortUrl.country[a])[0];
        
        var text = "_Short URL:_ " + url + "\n\n" + "_Total Clicks: " + shortUrl["total-clicks"] + "_\n\n" + 
        "_Most Used Browser: " + mostUsedBrowser + " (" + shortUrl.browser[mostUsedBrowser] + " clicks)_\n" +
        "_Most Used OS: " + mostUsedOS + " (" + shortUrl.os_name[mostUsedOS] + " clicks)_\n" +
        "_Most Visited Country: " + mostVisistedCountry + " (" + shortUrl.country[mostVisistedCountry] + " clicks)_\n\n" +
        "_Created At: " + shortUrl["creation-date"] + "_\n" +
        "_Creation Time: " + shortUrl["creation-time"] + "_\n" +
        "_Last Clicked At: " + shortUrl["last-click"] + "_\n" +
        "_Avarage Click Rate: " + shortUrl["average_weekly_clicks"] + " clicks/week_"


        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: text, edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: text, edit: publicMessage.key });
        }
    } catch (error) {
        console.log(error);
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: '_❌ An error occurred while getting the data._', edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: '_❌ An error occurred while getting the data._', edit: publicMessage.key });
        }
    }
    return;
})