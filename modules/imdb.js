const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

/**
 * Searches for a movie on IMDb and returns its details.
 * @param {string} movieName - The name of the movie to search for.
 * @returns {Promise<{status: number, title: string, description: string, rating: string, url: string, director: string, writer: string, actors: string[], stars: string[], thumbnail: string, release_date: string, length: string}>} - A Promise that resolves to an object with the movie details, or rejects with an error.
 */
async function searchMovie(movieName) {
    let response = await axios.get("https://v3.sg.media-imdb.com/suggestion/x/" + encodeURIComponent(movieName) + ".json?includeVideos=1");
    const jsonData = response.data;
    if (!jsonData.d || jsonData.d.length === 0) {
        return { status: 404 };
    }
    const movies = jsonData.d.filter((movie) => movie.qid === "movie" || movie.qid === "tvMovie");
    if (movies.length === 0) {
        return { status: 404 };
    }
    const url = "https://www.imdb.com/title/" + movies[0].id + "/";
    let moviePageResponse = await axios.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/237.84.2.178 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
        }
    });
    const moviePage = moviePageResponse.data;
    const $ = cheerio.load(moviePage);
    const movieTitle = $(".hero__primary-text").text().trim();
    const movieRating = $(".sc-d541859f-1.imUuxf").first().text().trim() + "/10";
    const director = $(".ipc-metadata-list-item__list-content-item.ipc-metadata-list-item__list-content-item--link").first().text().trim();
    const writer = $(".ipc-metadata-list-item__list-content-item.ipc-metadata-list-item__list-content-item--link").eq(1).text().trim();
    const description = $(".sc-42125d72-1").text().trim();

    const actorNames = [];
    $('section[data-testid="title-cast"].celwidget').find('.sc-cd7dc4b7-1.kVdWAO').each((i, element) => {
        actorNames.push($(element).text().trim());
    });

    let aa2 = "";
    const parts = moviePage.split('<li role="presentation" class="ipc-metadata-list__item ipc-metadata-list-item--link" data-testid="title-pc-principal-credit">');
    for (const part of parts) {
        if (part.includes("Stars")) {
            aa2 = part.split('<a class="ipc-metadata-list-item__icon-link"')[0];
            break;
        }
    }
    const $2 = cheerio.load(aa2);
    const stars = [];
    $2('ul.ipc-inline-list li a').each((index, element) => {
        stars.push($2(element).text().trim());
    });

    const thumbnail = movies[0]?.i?.imageUrl || "";
    const rDate = [];
    $('.ipc-link.ipc-link--baseAlt.ipc-link--inherit-color').each((i, element) => {
        const text = $(element).text().trim();
        if (/^\d+$/.test(text)) {
            rDate.push(text);
        }
    });

    let length = "";
    $('.ipc-inline-list__item').each((i, element) => {
        const text = $(element).text().trim();
        if (/^\d+h \d+m$/.test(text)) {
            length = text;
            return false;
        }
    });

    return {
        status: 200,
        title: movieTitle,
        description,
        rating: movieRating,
        url: url,
        director: director,
        writer: writer,
        actors: actorNames,
        stars: stars,
        thumbnail: thumbnail,
        release_date: rDate[0],
        length: length
    };
}

addCommand({ pattern: "^imdb ?(.*)$", access: "all", desc: "_Searches for a movie on IMDb._", pluginVersion: "1.0.1", pluginId: "imdb" }, async (msg, match, sock, rawMessage) => {

    const movieName = match[1];
    if (!movieName) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a movie name to search for._", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a movie name to search for._"}, { quoted: rawMessage.messages[0] });
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_Searching for movie..._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_Searching for movie..._"}, { quoted: rawMessage.messages[0] });
    }

    var imdbData;
    try {
        imdbData = await searchMovie(movieName);
    } catch {
        imdbData = { status: 404 };
    }

    if (imdbData.status === 404) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Movie not found._", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Movie not found._", edit: publicMessage.key });
        }
    }

    var buffer = await global.downloadarraybuffer(imdbData.thumbnail);
    var mediaPath = "./src/imdb_" + Math.floor(Math.random() * 20) + ".jpg";
    fs.writeFileSync(mediaPath, buffer);

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, {delete: msg.key});
        await sock.sendMessage(msg.key.remoteJid, {
            image: { url: mediaPath },
            caption: "_📽️ Movie Details 📽️_\n\n" + "*Title::* _" + imdbData.title + "_\n*Description::* _" + imdbData.description + "_\n*Rating::* _" + imdbData.rating + "_\n*Director::* _" + imdbData.director + "_\n*Writer::* _" + imdbData.writer + "_\n*Actors::* _" + imdbData.actors.join(", ") + "_\n*Stars::* _" + imdbData.stars.join(", ") + "_\n*Release Date::* _" + imdbData.release_date + "_\n*Length::* _" + imdbData.length + "_\n*URL::* _" + imdbData.url + "_",
        });
    } else {
        await sock.sendMessage(msg.key.remoteJid, {delete: publicMessage.key});
        await sock.sendMessage(msg.key.remoteJid, {
            image: { url: mediaPath },
            caption: "_📽️ Movie Details 📽️_\n\n" + "*Title::* _" + imdbData.title + "_\n*Description::* _" + imdbData.description + "_\n*Rating::* _" + imdbData.rating + "_\n*Director::* _" + imdbData.director + "_\n*Writer::* _" + imdbData.writer + "_\n*Actors::* _" + imdbData.actors.join(", ") + "_\n*Stars::* _" + imdbData.stars.join(", ") + "_\n*Release Date::* _" + imdbData.release_date + "_\n*Length::* _" + imdbData.length + "_\n*URL::* _" + imdbData.url + "_",
        })
    }
    try {fs.unlinkSync(mediaPath);} catch {}
})