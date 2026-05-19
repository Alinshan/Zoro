const axios = require("axios");

addCommand({ pattern: "^chatgpt ?(.*)", access: "sudo", desc: "Start a ChatGPT (o3) session!", pluginVersion: "1.1.3", pluginId: "o3gpt" }, async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;
    if (!global.database.o3mini) global.database.o3mini = [];
    var findO3SessioninDb = global.database.o3mini.find(session => session.groupId == groupId);
    var findGlobalO3Config = global.database?.o3miniConfigs
    if (!findGlobalO3Config) {
        global.database.o3miniConfigs = {
            onlyGroup: false,
            onlyPrivate: false,
            lockAllChats: false,
            generalSystemPrompt: "",
        }
    }
    if (!findO3SessioninDb) {
        global.database.o3mini.push({
            groupId: groupId,
            totalMessages: 0,
            systemPrompt: "",
            active: false,
        });
        findO3SessioninDb = global.database.o3mini.find(session => session.groupId == groupId);
    }
    var argument = match[1];
    if (!argument) {
        var text = `🤖 *GPT o3*\n\n` +
            (findO3SessioninDb.active ? "_System Prompt:_ " + findO3SessioninDb.systemPrompt + "\n" : "_System Prompt: Using Defaults_\n") +
            (findO3SessioninDb.active ? "_Total Messages:_ " + findO3SessioninDb.totalMessages + "\n" : "") +
            (findO3SessioninDb.active ? "_🟢 AI Chat is active in this group!_\n\n" : "_🔴 AI Chat is inactive in this group!_\n\n") +
            "_Type_ `chatgpt <on || off>` _to activate AI Chat in this group._\n" +
            "_Type_ `chatgpt sys <system prompt>` _to set system prompt for AI Chat in this group._\n" +
            "_Type_ `chatgpt global` _to change settings for AI Chat in all groups._"

        if (msg.key.fromMe) {
            return await sock.sendMessage(groupId, { text: text, edit: msg.key });
        } else {
            return await sock.sendMessage(groupId, { text: text }, { quoted: rawMessage.messages[0] });
        }
    } else {
        argument = argument.toLowerCase().trimStart();
        if (argument == "on") {
            findO3SessioninDb.active = true;
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_🟢 AI Chat is active in this group!_", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_🟢 AI Chat is active in this group!_" }, { quoted: rawMessage.messages[0] });
            }
        } else if (argument == "off") {
            findO3SessioninDb.active = false;
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_🔴 AI Chat is inactive in this group!_", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_🔴 AI Chat is inactive in this group!_" }, { quoted: rawMessage.messages[0] });
            }
        }
        if (argument.startsWith("sys ")) {
            var systemPrompt = argument.replace("sys ", "");
            findO3SessioninDb.systemPrompt = systemPrompt;
            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: "_✅ System Prompt has been set to: " + systemPrompt + "_", edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: "_✅ System Prompt has been set to: " + systemPrompt + "_" }, { quoted: rawMessage.messages[0] });
            }
        }
        if (argument == "global") {
            var text = `🤖 *GPT o3*\n\n` +
                (global.database.o3miniConfigs.onlyGroup ? "_🟢 Only Group Chat is active in all groups!_\n" : "_🔴 Only Group Chat is inactive in all groups!_\n") +
                (global.database.o3miniConfigs.onlyPrivate ? "_🟢 Only Private Chat is active in all groups!_\n" : "_🔴 Only Private Chat is inactive in all groups!_\n") +
                (global.database.o3miniConfigs.lockAllChats ? "_🟢 All Chats are locked in all groups!_\n" : "_🔴 All Chats are unlocked in all groups!_\n") +
                (global.database.o3miniConfigs?.generalSystemPrompt !== "" ? "_✅ General System Prompt is set to: " + global.database.o3miniConfigs.generalSystemPrompt + "_\n" : "_❌ General System Prompt is not set in all groups!_\n") +
                "\n_Type_ `chatgpt global <on || off>` _to activate/deactivate Only Group Chat in all groups._\n" +
                "_Type_ `chatgpt global private <on || off>` _to activate/deactivate Only Private Chat in all groups._\n" +
                "_Type_ `chatgpt global lock <on || off>` _to activate/deactivate All Chats in all groups._\n" +
                "_Type_ `chatgpt global sys <system prompt>` _to set general system prompt for all groups._\n" +
                "_Type_ `chatgpt global sys off` _to remove general system prompt from all groups._"

            if (msg.key.fromMe) {
                return await sock.sendMessage(groupId, { text: text, edit: msg.key });
            } else {
                return await sock.sendMessage(groupId, { text: text }, { quoted: rawMessage.messages[0] });
            }
        }
        if (argument.startsWith("global")) {
            var argument = argument.replace("global", "").trimStart();
            if (argument.startsWith("on")) {
                var oldprivate = global.database.o3miniConfigs.onlyPrivate;
                global.database.o3miniConfigs.onlyGroup = true;
                global.database.o3miniConfigs.onlyPrivate = false;
                
                var extramsg = "";
                if (oldprivate == true && global.database.o3miniConfigs.onlyPrivate == false) extramsg = "\n_🔴 Only Private Chat has been disabled!_";
                
                if (msg.key.fromMe) {
                    return await sock.sendMessage(groupId, { text: "_🟢 Only Group Chat is active in all groups!_" + extramsg, edit: msg.key });
                } else {
                    return await sock.sendMessage(groupId, { text: "_🟢 Only Group Chat is active in all groups!_" + extramsg }, { quoted: rawMessage.messages[0] });
                }
            } else if (argument.startsWith("off")) {
                global.database.o3miniConfigs.onlyGroup = false;
                if (msg.key.fromMe) {
                    return await sock.sendMessage(groupId, { text: "_🔴 Only Group Chat is inactive in all groups!_", edit: msg.key });
                } else {
                    return await sock.sendMessage(groupId, { text: "_🔴 Only Group Chat is inactive in all groups!_" }, { quoted: rawMessage.messages[0] });
                }
            }
            if (argument.startsWith("private")) {
                var onOffStatus  = String(argument.split("private")[1]).trimStart().toLowerCase();

                if (onOffStatus == "on") {
                    var oldgroup = global.database.o3miniConfigs.onlyGroup;
                    global.database.o3miniConfigs.onlyGroup = false;
                    global.database.o3miniConfigs.onlyPrivate = true;

                    var extramsg = "";
                    if (oldgroup == true && global.database.o3miniConfigs.onlyGroup == false) extramsg = "\n_🔴 Only Group Chat has been disabled!_";

                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_🟢 Only Private Chat is active in all groups!_" + extramsg, edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_🟢 Only Private Chat is active in all groups!_" + extramsg }, { quoted: rawMessage.messages[0] });
                    }
                } else if (onOffStatus == "off") {
                    global.database.o3miniConfigs.onlyPrivate = false;
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_🔴 Only Private Chat is inactive in all groups!_", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_🔴 Only Private Chat is inactive in all groups!_" }, { quoted: rawMessage.messages[0] });
                    }
                } else {
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_❌ Invalid argument! Please use `on` or `off` as argument._", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_❌ Invalid argument! Please use `on` or `off` as argument._" }, { quoted: rawMessage.messages[0] });
                    }
                }
            }
            if (argument.startsWith("lock")) {
                var onOffStatus  = String(argument.split("lock")[1]).trimStart().toLowerCase();
                
                if (onOffStatus == "on") {
                    global.database.o3miniConfigs.lockAllChats = true;
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_🟢 All Chats are locked in all groups!_", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_🟢 All Chats are locked in all groups!_" }, { quoted: rawMessage.messages[0] });
                    }
                } else if (onOffStatus == "off") {
                    global.database.o3miniConfigs.lockAllChats = false;
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_🔴 All Chats are unlocked in all groups!_", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_🔴 All Chats are unlocked in all groups!_" }, { quoted: rawMessage.messages[0] });
                    }
                } else {
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_❌ Invalid argument! Please use `on` or `off` as argument._", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_❌ Invalid argument! Please use `on` or `off` as argument._" }, { quoted: rawMessage.messages[0] });
                    }
                }
            }
            if (argument.startsWith("sys")) {
                var onOffStatusOrSystemPrompt  = String(argument.split("sys")[1]).trimStart().toLowerCase();
                
                if (onOffStatusOrSystemPrompt == "off") {
                    global.database.o3miniConfigs.generalSystemPrompt = "";
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_🔴 System Prompt has been removed from all groups!_", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_🔴 System Prompt has been removed from all groups!_" }, { quoted: rawMessage.messages[0] });
                    }
                } else {
                    global.database.o3miniConfigs.generalSystemPrompt = onOffStatusOrSystemPrompt;
                    if (msg.key.fromMe) {
                        return await sock.sendMessage(groupId, { text: "_✅ System Prompt has been set to: " + onOffStatusOrSystemPrompt + "_", edit: msg.key });
                    } else {
                        return await sock.sendMessage(groupId, { text: "_✅ System Prompt has been set to: " + onOffStatusOrSystemPrompt + "_" }, { quoted: rawMessage.messages[0] });
                    }
                }
            }
        }
    }
})

var cooldowns = {
    "000000@g.us": new Date().getTime(),
    "000000@s.whatsapp.net": new Date().getTime()
}

addCommand({ pattern: "onMessage", dontAddCommandList: true, access: "all" }, async (msg, match, sock, rawMessage) => {
    var fincCooldowns = cooldowns[msg.key.remoteJid];
    if (!fincCooldowns) {
        cooldowns[msg.key.remoteJid] = new Date().getTime();
    } else {
        var newDate = new Date().getTime();
        var timeDiff = Math.abs(newDate - fincCooldowns);
        if (timeDiff < 5000) {
            return;
        }
    }
    const generalChatConfigs = global.database?.o3miniConfigs || false;
    const quotedMessage = msg?.quotedMessage?.conversation || msg?.quotedMessage?.extendedTextMessage?.text || "";
    if (generalChatConfigs && (((msg?.message?.conversation || msg?.message?.extendedTextMessage?.text) && (quotedMessage !== "")) || (msg.text && msg.text.includes("@" + sock.user.id.split(":")[0])))) {
        var findO3SessioninDb = global.database.o3mini.find(session => session.groupId == msg.key.remoteJid);
        if (findO3SessioninDb || (sock.user.id.split(":")[0] == msg.key.remoteJid.split("@")[0] && msg.key.fromMe) ) {
            if (generalChatConfigs.onlyGroup && !findO3SessioninDb.groupId.startsWith("g")) return;
            if (generalChatConfigs.onlyPrivate && findO3SessioninDb.groupId.startsWith("g")) return;
            if (generalChatConfigs.lockAllChats) return;
            if (!findO3SessioninDb.active) return;
            if (msg.key.fromMe && (sock.user.id.split(":")[0] !== msg.key.remoteJid.split("@")[0])) return;
            var getSystemPrompt = generalChatConfigs.generalSystemPrompt === "" ? findO3SessioninDb.systemPrompt : generalChatConfigs.generalSystemPrompt;
            var payload = {
                query: msg.text.replace("@" + sock.user.id.split(":")[0], "")
            }
            var ownerId = "@" + sock.user.id.split(":")[0];
            if (getSystemPrompt !== "") payload.systemPrompt = getSystemPrompt;
            if (quotedMessage !== "") payload.replyContent = quotedMessage.replace(ownerId, "").trimStart();
            if (payload?.replyContent == "") payload.replyContent = "?"
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid) 
            payload.implementation = process.env
            var response = await axios({
                url: "https://create.thena.workers.dev/chat",
                method: "post",
                data: payload
            })
            var responseMessage = response.data;
            await sock.sendPresenceUpdate('paused', msg.key.remoteJid)
            cooldowns[msg.key.remoteJid] = new Date().getTime();
            if (responseMessage.status !== 200) {
                if (msg.key.fromMe && (sock.user.id.split(":")[0] == msg.key.remoteJid.split("@")[0])) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Error: " + responseMessage.content + "_" });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Error: " + responseMessage.content + "_" }, { quoted: rawMessage.messages[0] });
            } else {
                global.database.o3mini[global.database.o3mini.findIndex(session => session.groupId == msg.key.remoteJid)].totalMessages++
                if (msg.key.fromMe && (sock.user.id.split(":")[0] == msg.key.remoteJid.split("@")[0])) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: responseMessage.content.replace(/\\n/gmi, '\n') });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: responseMessage.content.replace(/\\n/gmi, '\n').replace(/(\\"|\\')</gmi, '"') }, { quoted: rawMessage.messages[0] });
            }
        }
    }
})