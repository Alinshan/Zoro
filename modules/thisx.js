const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

async function thisPersonDoesNotExist() {
    const response = await axios.get("https://thispersondoesnotexist.com/",  { responseType: "arraybuffer" });;
    return response.data;
}

async function thisHouseDoesNotExist(out) {
    var response = await axios.get("https://thishousedoesnotexist.org/");
    response = response.data;
    response = "https://thishousedoesnotexist.org" + response.split('<img class="img-house" src="')[1].split('"')[0];
    const response2 = await axios.get(response, { responseType: "arraybuffer" });
    fs.writeFileSync(out, response2.data);
    return out
}

async function thisWordDoesNotExist() {
    var response = await axios.get("https://www.thisworddoesnotexist.com/");
    response = response.data;
    return {
        word: response.split('<div id="definition-word" class="word">')[1].split('</div>')[0].split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
        definition: response.split('<div id="definition-definition" class="definition">')[1].split('</div>')[0].trim().charAt(0).toUpperCase() + response.split('<div id="definition-definition" class="definition">')[1].split('</div>')[0].trim().slice(1),
    }
}

addCommand({ pattern: "^thisx ?(.*)", access: "all", desc: "_An implementation of the This X Dont Exist_", pluginVersion: "1.0.0", pluginId: "thisx"}, async (msg, match, sock, rawMessage) => {
    var command = match[1];
    if (!command) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a command._\n_Example::_ ```' + global.handlers[0] + "thisx <person, house, word>```", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a command._\n_Example::_ ```' + global.handlers[0] + "thisx <person, house, word>```"}, { quoted: rawMessage.messages[0] });
        }
    }

    command = command.toLowerCase().trim()
    var housePath = "./src/this_house_does_not_exist" + Math.floor(Math.random() * 20) + ".png"
    var housePath2 = "./src/this_house_does_not_exist" + Math.floor(Math.random() * 200) + ".png"
    var personPath = "./src/this_person_does_not_exist" + Math.floor(Math.random() * 20) + ".png"

    if (command == "person") {
        var person = await thisPersonDoesNotExist();
        var personPath = "./src/this_person_does_not_exist" + Math.floor(Math.random() * 20) + ".png"
        fs.writeFileSync(personPath, person);
        await sock.sendMessage(msg.key.remoteJid, {delete: msg.key})
        await sock.sendMessage(msg.key.remoteJid, { image: {url: personPath}, caption: "_This person does not exist_" });
        try { fs.unlinkSync(personPath); } catch (err) { }
        return;
    } else if (command == "house") {
        var house = await thisHouseDoesNotExist(housePath);
        ffmpeg(house).outputOptions('-vf', 'crop=in_w:in_h-50').save(housePath2).on('end', async () => {
            await sock.sendMessage(msg.key.remoteJid, {delete: msg.key})
            await sock.sendMessage(msg.key.remoteJid, { image: {url: housePath2}, caption: "_This house does not exist_" });
            try { fs.unlinkSync(housePath); } catch (err) { }
            try { fs.unlinkSync(housePath2); } catch (err) { }
            return;
        });
       
    } else if (command == "word") {
        var word = await thisWordDoesNotExist();
        await sock.sendMessage(msg.key.remoteJid, {delete: msg.key})
        await sock.sendMessage(msg.key.remoteJid, { text: "_Word:_ *" + word.word + "*\n_Definition:_ *" + word.definition + "*"});
        return;
    } else {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Invalid command._\n_Example::_ ```' + global.handlers[0] + "thisx <person, house, word>```", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Invalid command._\n_Example::_ ```' + global.handlers[0] + "thisx <person, house, word>```"}, { quoted: rawMessage.messages[0] });
        }
    }
    
})