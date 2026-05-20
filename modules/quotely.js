const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const fs = require('fs');

var colorMap = {
    "-t": "transparent",
    "-transparent": "transparent",
    "-trans": "transparent",
    "-green": "#008000",
    "-red": "#FF0000",
    "-blue": "#0000FF",
    "-yellow": "#FFFF00",
    "-purple": "#800080",
    "-orange": "#FFA500",
    "-pink": "#FFC0CB",
    "-cyan": "#00FFFF",
    "-brown": "#A52A2A",
    "-gray": "#808080",
    "-black": "#000000",
    "-white": "#FFFFFF",
    "-lightgrey": "#D3D3D3",
    "-lightgreen": "#90EE90",
    "-lightred": "#FFB6C1",
    "-lightblue": "#ADD8E6",
    "-lightyellow": "#FFFFE0",
    "-lightpurple": "#D8BFD8",
    "-lightorange": "#FFDAB9",
    "-lightpink": "#FFC0CB",
    "-lightcyan": "#E0FFFF",
    "-lightbrown": "#A0522D",
    "-lightgray": "#D3D3D3",
    "-darkgreen": "#006400",
    "-darkred": "#8B0000",
    "-darkblue": "#00008B",
    "-darkyellow": "#B8860B",
    "-darkpurple": "#800080",
    "-darkorange": "#A52A2A",
    "-darkpink": "#FF1493",
    "-darkcyan": "#008B8B",
    "-darkbrown": "#8B4513",
    "-darkgray": "#A9A9A9",
    "-violet": "#EE82EE",
    "-indigo": "#4B0082",
    "-magenta": "#FF00FF",
    "-teal": "#008080",
    "-lime": "#00FF00",
    "-maroon": "#800000",
    "-olive": "#808000",
    "-navy": "#000080",
    "-fuchsia": "#FF00FF",
    "-aqua": "#00FFFF",
    "-silver": "#C0C0C0",
    "-gold": "#FFD700",
    "-coral": "#FF7F50",
    "-orchid": "#DA70D6",
    "-lavender": "#E6E6FA",
    "-plum": "#DDA0DD",
    "-tan": "#D2B48C",
    "-peach": "#FFE5B4",
    "-khaki": "#F0E68C",
    "-wheat": "#F5DEB3",
    "-linen": "#FAF0E6",
    "-beige": "#F5F5DC",
    "-azure": "#F0FFFF",
    "-honeydew": "#F0FFF0",
    "-mint": "#F5FFFA",
    "-snow": "#FFFAFA",
    "-ivory": "#FFFFF0",
    "-aliceblue": "#F0F8FF",
    "-ghostwhite": "#F8F8FF",
    "-whitesmoke": "#F5F5F5",
    "-seashell": "#FFF5EE",
    "-mintcream": "#F5FFFA",
    "-blanchedalmond": "#FFEBCD",
    "-bisque": "#FFE4C4",
    "-navajowhite": "#FFDEAD",
    "-cornsilk": "#FFF8DC",
    "-lemonchiffon": "#FFFACD",
    "-floralwhite": "#FFFAF0",
    "-oldlace": "#FDF5E6",
    "-antiquewhite": "#FAEBD7",
    "-papayawhip": "#FFEFD5",
    "-crimson": "#DC143C",
    "-indianred": "#CD5C5C",
    "-slateblue": "#6A5ACD",
    "-mediumseagreen": "#3CB371",
    "-mediumturquoise": "#48D1CC",
    "-royalblue": "#4169E1",
    "-darkslateblue": "#483D8B",
    "-darkslategray": "#2F4F4F",
    "-scarlet": "#FF2400",
    "-chartreuse": "#7FFF00",
    "-cerulean": "#007BA7",
    "-periwinkle": "#CCCCFF",
    "-aquamarine": "#7FFFD4",
    "-blueviolet": "#8A2BE2",
    "-burlywood": "#DEB887",
    "-cadetblue": "#5F9EA0",
    "-chocolate": "#D2691E",
    "-cornflowerblue": "#6495ED",
    "-darkgoldenrod": "#B8860B",
    "-darkgrey": "#A9A9A9",
    "-darkkhaki": "#BDB76B",
    "-darkmagenta": "#8B008B",
    "-darkolivegreen": "#556B2F",
    "-darkorchid": "#9932CC",
    "-darksalmon": "#E9967A",
    "-darkseagreen": "#8FBC8F",
    "-darkslategrey": "#2F4F4F",
    "-darkturquoise": "#00CED1",
    "-darkviolet": "#9400D3",
    "-deeppink": "#FF1493",
    "-deepskyblue": "#00BFFF",
    "-dimgray": "#696969",
    "-dimgrey": "#696969",
    "-dodgerblue": "#1E90FF",
    "-firebrick": "#B22222",
    "-forestgreen": "#228B22",
    "-gainsboro": "#DCDCDC",
    "-goldenrod": "#DAA520",
    "-greenyellow": "#ADFF2F",
    "-grey": "#808080",
    "-hotpink": "#FF69B4",
    "-lavenderblush": "#FFF0F5",
    "-lawngreen": "#7CFC00",
    "-lightcoral": "#F08080",
    "-lightgoldenrodyellow": "#FAFAD2",
    "-lightsalmon": "#FFA07A",
    "-lightseagreen": "#20B2AA",
    "-lightskyblue": "#87CEFA",
    "-lightslategray": "#778899",
    "-lightslategrey": "#778899",
    "-lightsteelblue": "#B0C4DE",
    "-limegreen": "#32CD32",
    "-mediumaquamarine": "#66CDAA",
    "-mediumblue": "#0000CD",
    "-mediumorchid": "#BA55D3",
    "-mediumpurple": "#9370DB",
    "-mediumslateblue": "#7B68EE",
    "-mediumspringgreen": "#00FA9A",
    "-mediumvioletred": "#C71585",
    "-midnightblue": "#191970",
    "-mistyrose": "#FFE4E1",
    "-moccasin": "#FFE4B5",
    "-olivedrab": "#6B8E23",
    "-orangered": "#FF4500",
    "-palegoldenrod": "#EEE8AA",
    "-palegreen": "#98FB98",
    "-paleturquoise": "#AFEEEE",
    "-palevioletred": "#DB7093",
    "-peachpuff": "#FFDAB9",
    "-peru": "#CD853F",
    "-powderblue": "#B0E0E6",
    "-rebeccapurple": "#663399",
    "-rosybrown": "#BC8F8F",
    "-saddlebrown": "#8B4513",
    "-salmon": "#FA8072",
    "-sandybrown": "#F4A460",
    "-seagreen": "#2E8B57",
    "-sienna": "#A0522D",
    "-skyblue": "#87CEEB",
    "-slategray": "#708090",
    "-slategrey": "#708090",
    "-springgreen": "#00FF7F",
    "-steelblue": "#4682B4",
    "-thistle": "#D8BFD8",
    "-tomato": "#FF6347",
    "-turquoise": "#40E0D0",
    "-yellowgreen": "#9ACD32"
}

addCommand({ pattern: "^q ?([\\s\\S]*)", access: "all", desc: "_Generate stickers from text._", usage: global.handlers[0] + "q <text or reply> <color(-red, -t, -cyan etc.)>", pluginVersion: "1.1.4", pluginId: "quotly"}, async (msg, match, sock, rawMessage) => {
    var text = match[1]

    if (!text && !msg.quotedMessage) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please write a text or reply to a message!_", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please write a text or reply to a message!_" }, { quoted: rawMessage.messages[0] });
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Generating.._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Generating.._" }, { quoted: rawMessage.messages[0] });
    }
    var randomHexColor = "#134d37" || "#" + Math.floor(Math.random() * 16777215).toString(16);

    var payloadData;
    try {
        if (msg.quotedMessage) {
            const quoted = msg.quotedMessage;
            var bgColor = randomHexColor;
            if (text) {
                var color = text.match(/-[a-zA-Z]+/gmi);
                if (color) {
                    if (colorMap[color[0]]) {
                        bgColor = colorMap[color[0]];
                        text = text.replace(color[0], "")
                    }
                }
            }

            var codeText = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || quoted.videoMessage?.caption || "";
            var codeTextArray = codeText.split(" ");
            var finalCodeText = "";
            var i2 = 0
            for (var i = 0; i < codeTextArray.length; i++) {
                i2++
                if (i2 == 4) {
                  finalCodeText += codeTextArray[i]+ " " + "\n"
                  i2 = 0
                } else {
                  finalCodeText += codeTextArray[i] + " "
                }
            }
            finalCodeText = finalCodeText.trimEnd().trimStart();

            const quotedParticipantJid = rawMessage.messages[0].message?.extendedTextMessage?.contextInfo?.participant || rawMessage.messages[0].key.participant || rawMessage.messages[0].key.remoteJid;
            let quotedParticipantName = (global.database?.users && global.database.users[quotedParticipantJid]) || msg.pushName || "Zoro User";
            if (quotedParticipantName && typeof quotedParticipantName === 'object') {
                quotedParticipantName = quotedParticipantName.name || "Zoro User";
            }

            let quotedPfpUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";
            try {
                if (quotedParticipantJid) {
                    quotedPfpUrl = await sock.profilePictureUrl(quotedParticipantJid, 'image');
                }
            } catch (err) {}

            payloadData = {
                type: "quote",
                format: "png",
                backgroundColor: bgColor,
                width: 768,
                height: 512,
                scale: 2,
                messages: [
                    {
                        entities: [],
                        avatar: true,
                        from: {
                            id: 1,
                            name: quotedParticipantName,
                            photo: {
                                url: quotedPfpUrl
                            }
                        },
                        text: finalCodeText,
                        replyMessage: {}
                    }
                ]
            };
        } else {
            var bgColor = randomHexColor;
            if (text) {
                var color = text.match(/-[a-zA-Z]+/gmi);
                if (color) {
                    if (colorMap[color[0]]) {
                        bgColor = colorMap[color[0]];
                        text = text.replace(color[0], "")
                    }
                }
            }

            var codeTextArray = text.split(" ");
            var finalCodeText = "";
            var i2 = 0
            for (var i = 0; i < codeTextArray.length; i++) {
                i2++
                if (i2 == 4) {
                  finalCodeText += codeTextArray[i]+ " " + "\n"
                  i2 = 0
                } else {
                  finalCodeText += codeTextArray[i] + " "
                }
            }
            finalCodeText = finalCodeText.trimEnd().trimStart();

            const participantJid = msg.key.participant || msg.key.remoteJid || sock.user.id;
            let pfpUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";
            try {
                if (participantJid) {
                    pfpUrl = await sock.profilePictureUrl(participantJid, 'image');
                }
            } catch (err) {}

            payloadData = {
                type: "quote",
                format: "png",
                backgroundColor: bgColor,
                width: 768,
                height: 512,
                scale: 2,
                messages: [
                    {
                        entities: [],
                        avatar: true,
                        from: {
                            id: 1,
                            name: msg.pushName || "Zoro User",
                            photo: {
                                url: pfpUrl
                            }
                        },   
                        text: finalCodeText,
                        replyMessage: {}
                    }
                ]
            };
        }
    } catch {
        const errorText = "_❌ Failed to generate quote. Please reply a text message!_";
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: errorText, edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: errorText, edit: publicMessage.key });
        }
        return;
    }

    try {
        var generateQuote = await axios({
            url: "https://bot.lyo.su/quote/generate",
            method: "POST",
            data: payloadData,
            headers: {
                "Content-Type": "application/json"
            }
        })
        if (generateQuote.data.ok == true) {
            const imagePath = "./src/quote" + Math.floor(Math.random() * 100) + ".png";
            const imagePath2 = "./src/quote" + Math.floor(Math.random() * 10000) + ".webp";
            fs.writeFileSync(imagePath, generateQuote.data.result.image, 'base64');
            ffmpeg(imagePath).outputOptions(["-y", "-vcodec libwebp"]).videoFilters('scale=2000:2000:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=2000:2000:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1').save(imagePath2).on('end', async () => {
                await global.addExif(imagePath2, "© ᴢᴏʀᴏ ʙᴏᴛ", "© ᴢᴏʀᴏ ʙᴏᴛ");
                if (msg.key.fromMe) {
                    await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                    await sock.sendMessage(msg.key.remoteJid, { sticker: { url: imagePath2 } });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { delete: publicMessage.key });
                    await sock.sendMessage(msg.key.remoteJid, { sticker: { url: imagePath2 } }, { quoted: rawMessage.messages[0] });
                }
                [imagePath, imagePath2].forEach(file => {
                    if (fs.existsSync(file)) try { fs.unlinkSync(file) } catch { }
                });
                return
            });
        } else {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Something went wrong!_", edit: msg.key });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { delete: publicMessage.key });
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Something went wrong!_" }, { quoted: rawMessage.messages[0] });
            }
        }
    } catch {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Something went wrong!_", edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { delete: publicMessage.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Something went wrong!_" }, { quoted: rawMessage.messages[0] });
        }
    }
})