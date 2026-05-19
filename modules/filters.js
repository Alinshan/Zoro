addCommand( {pattern: "onMessage", dontAddCommandList: true, access: "all"}, async (msg, match, sock, rawMessage) => {
    //! Warning! This type of commands are heavly resource intensive and can cause the bot to lag.
    const chatFilters = global.database.filters.find(filter => filter.chat === msg.key.remoteJid && filter.active == true);
    if (chatFilters && chatFilters.filters.length > 0) {
        for (const filter of chatFilters.filters) {
            if (new RegExp(filter.incoming).test(msg.text)) {
                if (msg.text.startsWith(".filter add") || msg.text.startsWith(".filter delete")) return;
                if (msg.key.fromMe) return;

                const outgoing = filter.outgoing.trim();
                const isUrlOrPath = outgoing.startsWith("http://") || outgoing.startsWith("https://") || outgoing.startsWith("./");

                if (isUrlOrPath) {
                    // 1. Audio / Voice Note
                    const isAudio = /\.(mp3|ogg|wav|m4a|aac|opus)(\?.*)?$/i.test(outgoing) || outgoing.startsWith("audio:") || outgoing.startsWith("vn:");
                    if (isAudio) {
                        let audioUrl = outgoing.replace(/^(audio:|vn:)/i, "").trim();
                        const asVoiceNote = !outgoing.startsWith("audio:");
                        return await sock.sendMessage(msg.key.remoteJid, {
                            audio: { url: audioUrl },
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: asVoiceNote
                        }, { quoted: rawMessage.messages[0] });
                    }

                    // 2. Video
                    const isVideo = /\.(mp4|gif|mkv|webm|avi)(\?.*)?$/i.test(outgoing) || outgoing.startsWith("video:");
                    if (isVideo) {
                        let videoUrl = outgoing.replace(/^video:/i, "").trim();
                        return await sock.sendMessage(msg.key.remoteJid, {
                            video: { url: videoUrl }
                        }, { quoted: rawMessage.messages[0] });
                    }

                    // 3. Image
                    const isImage = /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(outgoing) || outgoing.startsWith("image:");
                    if (isImage) {
                        let imageUrl = outgoing.replace(/^image:/i, "").trim();
                        return await sock.sendMessage(msg.key.remoteJid, {
                            image: { url: imageUrl }
                        }, { quoted: rawMessage.messages[0] });
                    }
                }

                // 4. Prefix overrides (vn:, audio:, video:, image:, sticker:)
                if (outgoing.startsWith("vn:") || outgoing.startsWith("audio:")) {
                    let audioUrl = outgoing.replace(/^(audio:|vn:)/i, "").trim();
                    return await sock.sendMessage(msg.key.remoteJid, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: outgoing.startsWith("vn:")
                    }, { quoted: rawMessage.messages[0] });
                }
                if (outgoing.startsWith("video:")) {
                    let videoUrl = outgoing.replace(/^video:/i, "").trim();
                    return await sock.sendMessage(msg.key.remoteJid, {
                        video: { url: videoUrl }
                    }, { quoted: rawMessage.messages[0] });
                }
                if (outgoing.startsWith("image:")) {
                    let imageUrl = outgoing.replace(/^image:/i, "").trim();
                    return await sock.sendMessage(msg.key.remoteJid, {
                        image: { url: imageUrl }
                    }, { quoted: rawMessage.messages[0] });
                }
                if (outgoing.startsWith("sticker:") || outgoing.startsWith("st:")) {
                    let stickerUrl = outgoing.replace(/^(sticker:|st:)/i, "").trim();
                    return await sock.sendMessage(msg.key.remoteJid, {
                        sticker: { url: stickerUrl }
                    }, { quoted: rawMessage.messages[0] });
                }

                // Default: send as standard text message
                return await sock.sendMessage(msg.key.remoteJid, { text: outgoing }, { quoted: rawMessage.messages[0] });
            }
        }
    }
})

addCommand( {pattern: "^filter ?([\\s\\S]*)", access: "all", desc: "_Add filters that automatically respond to your chats. Supports regexp._", usage: global.handlers[0] + "filter - " + global.handlers[0] + "filter <add || delete || on || off>"}, async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;
    var ifPrivateMessage = groupId.endsWith("@g.us") ? false : true;

    if (!ifPrivateMessage) {
        var admins = await global.getAdmins(msg.key.remoteJid);
        if (!admins.includes(msg.key.participant)) {
            if (msg.key.fromMe) {
                return sock.sendMessage(groupId, { text: "_You are not an admin in this group!_", edit: msg.key })
            } else {
                return sock.sendMessage(groupId, { text: "_You are not an admin in this group!_"}, { quoted: rawMessage.messages[0] })
            }
        }
    }
    

    if (!match[1].trim()) {
        const find = global.database.filters.find(x => x.chat === msg.key.remoteJid);
        if (find && find.filters.length > 0) {
            var text = "📜 _Filters In This Chat_\n" + find.filters.map((x, index) => `\n*${index + 1}.* \`\`\`${x.incoming}\`\`\``).join('');

            if (find.active) text += `\n\n*🟢 Filters are active in this chat*`;
            else text += `\n\n*🔴 Filters are disabled in this chat*`;

            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text, edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text }, { quoted: rawMessage.messages[0] });
            }
        } else {
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._"}, { quoted: rawMessage.messages[0] });
            }
        }
    }  

    if (match[1].startsWith("delete")) {
        const find = global.database.filters.find(x => x.chat === msg.key.remoteJid);
        if (!find || find.filters.length === 0) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._"}, { quoted: rawMessage.messages[0] });
            }
        }
        const filterToDelete = match[1].replace("delete", "").trim();
        if (!filterToDelete) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._"}, { quoted: rawMessage.messages[0] });
            }

        }
        const filterIndex = find.filters.findIndex(x => x.incoming === filterToDelete);
        if (filterIndex !== -1) {
            find.filters.splice(filterIndex, 1);
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: `_✅ Filter deleted successfully._\n_Deleted Filter ::_ \`\`\`${filterToDelete}\`\`\``, edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: `_✅ Filter deleted successfully._\n_Deleted Filter ::_ \`\`\`${filterToDelete}\`\`\``}, { quoted: rawMessage.messages[0] });
            }
        } else {
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_❌ No filters found._"}, { quoted: rawMessage.messages[0] });
            }
        }
    }
    
    if (match[1].startsWith("add")) {
        let find = global.database.filters.find(x => x.chat === msg.key.remoteJid);
        if (!find) {
            find = { chat: msg.key.remoteJid, active: true, filters: [] };
            global.database.filters.push(find);
        }
        const [incoming, ...outgoingParts] = match[1].replace("add", "").trim().split(" ");
        const outgoing = outgoingParts.join(" ").trim();
        if (!incoming || !outgoing) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_❌ Invalid filter format!_\n_Use_ ```.filter add <incoming> <outgoing>```", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_❌ Invalid filter format!_\n_Use_ ```.filter add <incoming> <outgoing>```"}, { quoted: rawMessage.messages[0] });
            }
        }
        const filterIndex = find.filters.findIndex(x => x.incoming === incoming);
        if (filterIndex !== -1) {
            find.filters[filterIndex].outgoing = outgoing;
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_✅ Filter updated successfully._", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_✅ Filter updated successfully._"}, { quoted: rawMessage.messages[0] });
            }
        }
        find.filters.push({ incoming, outgoing });
        if (msg.key.fromMe) {
            return await sock.sendMessage(groupId, { text: "_✅ Filter added successfully._", edit: msg.key });
        } else {
            return await sock.sendMessage(groupId, { text: "_✅ Filter added successfully._"}, { quoted: rawMessage.messages[0] });
        }
    }

    if (match[1].startsWith("on")) {
        let find = global.database.filters.find(x => x.chat === msg.key.remoteJid);
        if (!find) {
            find = { chat: msg.key.remoteJid, active: true, filters: [] };
            global.database.filters.push(find);
        } else {
            global.database.filters.find(x => x.chat === msg.key.remoteJid).active = true;
        }
        if (msg.key.fromMe) {
            return await sock.sendMessage(groupId, { text: "_✅ Filters enabled successfully._", edit: msg.key });
        } else {
            return await sock.sendMessage(groupId, { text: "_✅ Filters enabled successfully._"}, { quoted: rawMessage.messages[0] });
        }
    }

    if (match[1].startsWith("off")) {
        let find = global.database.filters.find(x => x.chat === msg.key.remoteJid);
        if (!find) {
            find = { chat: msg.key.remoteJid, active: true, filters: [] };
            global.database.filters.push(find);
        } else {
            global.database.filters.find(x => x.chat === msg.key.remoteJid).active = false;
        }
        if (msg.key.fromMe) {
            return await sock.sendMessage(groupId, { text: "_✅ Filters disabled successfully._", edit: msg.key });
        } else {
            return await sock.sendMessage(groupId, { text: "_✅ Filters disabled successfully._"}, { quoted: rawMessage.messages[0] });
        }
    }
})
