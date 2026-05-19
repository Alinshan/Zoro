const fs = require('fs');

/**
 * Normalizes a JID by stripping the device suffix (e.g. :5) and returning
 * the canonical form: `number@s.whatsapp.net` or `number@lid`.
 */
function normalizeJid(jid) {
    if (!jid) return '';
    const parts = jid.split('@');
    if (parts.length < 2) return jid;
    const user = parts[0].split(':')[0];
    const domain = parts[1];
    return `${user}@${domain}`;
}

/**
 * Resolves a JID (PN or LID) to its matching entry in the group participant list.
 * Returns the participant object if found, or null.
 */
async function resolveParticipant(sock, groupId, jid) {
    try {
        if (!jid) return null;
        const meta = await sock.groupMetadata(groupId);
        const normalized = normalizeJid(jid);
        // Match by PN number part only (ignores @s.whatsapp.net vs @lid domain)
        const numPart = normalized.split('@')[0];
        return meta.participants.find(p => {
            const pNum = normalizeJid(p.id).split('@')[0];
            return pNum === numPart;
        }) || null;
    } catch {
        return null;
    }
}

/**
 * Given a JID that could be a LID, tries to return a usable `@s.whatsapp.net` JID.
 * If the JID is already `@s.whatsapp.net`, returns it as-is.
 * If it is a LID, looks up the participant's real JID from group metadata.
 */
async function resolveToPN(sock, groupId, jid) {
    if (!jid) return null;
    const normalized = normalizeJid(jid);
    // If already a phone-number JID, return as-is
    if (normalized.endsWith('@s.whatsapp.net')) return normalized;
    // It's a LID - look up in group participants
    try {
        const meta = await sock.groupMetadata(groupId);
        const lidNum = normalized.split('@')[0];
        const found = meta.participants.find(p => {
            const pNorm = normalizeJid(p.id);
            if (pNorm.endsWith('@s.whatsapp.net')) return false; // skip PNs in this pass
            return pNorm.split('@')[0] === lidNum;
        });
        // If we found a LID participant, now look for their PN equivalent
        // Baileys may have both or just one; try finding by number across all
        if (found) {
            // Check if there's a matching @s.whatsapp.net entry with same number
            const lidNumStr = normalizeJid(found.id).split('@')[0];
            const pnMatch = meta.participants.find(p => {
                const pNorm = normalizeJid(p.id);
                return pNorm.endsWith('@s.whatsapp.net') && pNorm.split('@')[0] === lidNumStr;
            });
            if (pnMatch) return normalizeJid(pnMatch.id);
            // No PN equivalent found; use the LID as-is (WhatsApp sometimes accepts this)
            return normalizeJid(found.id);
        }
        return normalized;
    } catch {
        return normalized;
    }
}

/**
 * Updates the position of a user in a group.
 */
async function replaceUserPosition(sock, groupJid, userJid, argm) {
    try {
        // Resolve to PN if it's a LID
        const resolvedJid = await resolveToPN(sock, groupJid, userJid);
        console.log(`[replaceUserPosition] Action: ${argm}, JID: ${userJid} -> resolved: ${resolvedJid}`);
        var result = await sock.groupParticipantsUpdate(groupJid, [resolvedJid], argm);
        if (result && result[0] && (result[0].status == "200" || result[0].status === 200)) return true;
        console.log(`[replaceUserPosition] Failed result:`, JSON.stringify(result));
        return false;
    } catch (error) {
        console.error(`[replaceUserPosition] Error:`, error.message);
        return false;
    }
}

/**
 * Checks if the given participant JID is the bot itself (by number comparison).
 */
function preventOwner(sock, participant) {
    if (!participant || !sock.user) return false;
    const botNum = normalizeJid(sock.user.id).split('@')[0];
    const pNum = normalizeJid(participant).split('@')[0];
    return botNum === pNum;
}

/**
 * Sends a reply message, handling both fromMe and normal quoted modes.
 */
async function reply(sock, groupId, msg, rawMessage, text) {
    if (msg.key.fromMe) {
        return await sock.sendMessage(groupId, { text, edit: msg.key });
    } else {
        return await sock.sendMessage(groupId, { text }, { quoted: rawMessage.messages[0] });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BAN
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^ban ?(.*)", desc: "Allows you to ban a person from the group.", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    // Check sender admin status
    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    // Check bot admin status
    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    var result;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedParticipant = msg.message.extendedTextMessage.contextInfo.participant;
        if (preventOwner(sock, quotedParticipant)) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I can't ban myself!_");
        }
        result = await replaceUserPosition(sock, groupId, quotedParticipant, "remove");
    } else if (match[1]) {
        const targetJid = match[1].replace("@", "").replace("+", "").replace(/ /gmi, "") + "@s.whatsapp.net";
        if (preventOwner(sock, targetJid)) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I can't ban myself!_");
        }
        result = await replaceUserPosition(sock, groupId, targetJid, "remove");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_Please reply to someone or mention them!_");
    }

    if (result) {
        return await reply(sock, groupId, msg, rawMessage, "_✅ The person has been successfully banned from the group!_");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, an error occurred while trying to ban the user!_");
    }
}));

// ─────────────────────────────────────────────────────────────────────────────
// ADD
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^add ?(.*)", desc: "Allows you to add a person from the group.", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    var result;
    if (msg.quotedMessage) {
        const { extendedTextMessage, conversation } = msg.quotedMessage;
        if (!extendedTextMessage && !conversation) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, the user is not using WhatsApp!_");
        }
        var quotedText = extendedTextMessage?.text || conversation;
        quotedText = quotedText.replace("@", "").replace("+", "").replace(/ /gmi, "") + "@s.whatsapp.net";
        const [result2] = await sock.onWhatsApp(quotedText);
        if (!result2) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, the user is not using WhatsApp!_");
        }
        result = await replaceUserPosition(sock, groupId, quotedText, "add");
    } else if (match[1]) {
        const targetJid = match[1].replace("@", "").replace("+", "").replace(/ /gmi, "") + "@s.whatsapp.net";
        const [result2] = await sock.onWhatsApp(targetJid);
        if (!result2) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, the user is not using WhatsApp!_");
        }
        result = await replaceUserPosition(sock, groupId, targetJid, "add");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_Please enter a number!_");
    }

    if (result) {
        return await reply(sock, groupId, msg, rawMessage, "_✅ The person has been successfully added to the group!_");
    } else if (String(result) == "null") {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, you can't add this user to the group!_");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, an error occurred! Try: `add <number with country code>`_");
    }
}));

// ─────────────────────────────────────────────────────────────────────────────
// PROMOTE
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^promote ?(.*)", desc: "Allows you to make the user an admin in the group.", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    var result;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedParticipant = msg.message.extendedTextMessage.contextInfo.participant;
        if (preventOwner(sock, quotedParticipant)) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I can't promote myself!_");
        }
        result = await replaceUserPosition(sock, groupId, quotedParticipant, "promote");
    } else if (match[1]) {
        const targetJid = match[1].replace("@", "").replace("+", "").replace(/ /gmi, "") + "@s.whatsapp.net";
        if (preventOwner(sock, targetJid)) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I can't promote myself!_");
        }
        result = await replaceUserPosition(sock, groupId, targetJid, "promote");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_Please reply to someone or mention them._");
    }

    if (result) {
        return await reply(sock, groupId, msg, rawMessage, "_✅ The person has been successfully made an admin!_");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, an error occurred while trying to promote the user!_");
    }
}));

// ─────────────────────────────────────────────────────────────────────────────
// DEMOTE
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^demote ?(.*)", desc: "Allows you to remove the user from admin in the group.", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    var result;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedParticipant = msg.message.extendedTextMessage.contextInfo.participant;
        if (preventOwner(sock, quotedParticipant)) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I can't demote myself!_");
        }
        result = await replaceUserPosition(sock, groupId, quotedParticipant, "demote");
    } else if (match[1]) {
        const targetJid = match[1].replace("@", "").replace("+", "").replace(/ /gmi, "") + "@s.whatsapp.net";
        if (preventOwner(sock, targetJid)) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I can't demote myself!_");
        }
        result = await replaceUserPosition(sock, groupId, targetJid, "demote");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Please reply to someone or mention them!_");
    }

    if (result) {
        return await reply(sock, groupId, msg, rawMessage, "_✅ The person's admin privileges have been successfully removed!_");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, an error occurred while trying to demote the user!_");
    }
}));

// ─────────────────────────────────────────────────────────────────────────────
// MUTE
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^mute ?(.*)", desc: "Allows you to mute the group.", usage: "mute 1 <s|m|h>", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    const timeMatch = match[1].match(/^(\d+)([smhdwy])$/);
    if (timeMatch) {
        const time = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        const unitDurations = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
        const unitTexts = { s: "second(s)", m: "minute(s)", h: "hour(s)", d: "day(s)", w: "week(s)", y: "year(s)" };
        const duration = time * unitDurations[unit];

        await reply(sock, groupId, msg, rawMessage, `_✅ The group has been muted for ${time} ${unitTexts[unit]}!_`);
        await sock.groupSettingUpdate(groupId, 'announcement');

        setTimeout(async () => {
            await sock.groupSettingUpdate(groupId, 'not_announcement');
            await sock.sendMessage(groupId, { text: `_✅ The group has been unmuted!_` });
        }, duration);
        return;
    } else if (match[1] === "") {
        await sock.groupSettingUpdate(groupId, 'announcement');
        return await reply(sock, groupId, msg, rawMessage, "_✅ The group has been muted!_");
    } else {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Invalid time format. Use: `mute <time><unit>` (e.g. `mute 1h`)_");
    }
}));

// ─────────────────────────────────────────────────────────────────────────────
// UNMUTE
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^unmute ?(.*)", desc: "Allows you to unmute the group.", usage: "unmute", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    await sock.groupSettingUpdate(groupId, 'not_announcement');
    return await reply(sock, groupId, msg, rawMessage, "_✅ The group has been unmuted!_");
}));

// ─────────────────────────────────────────────────────────────────────────────
// GPP (Group Profile Picture)
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^gpp ?(.*)", desc: "Allows you to change the group icon/profile picture. Reply to an image.", access: "all", onlyInGroups: true }, (async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;

    // Check sender admin status
    var admins = await global.getAdmins(groupId);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!admins.includes(senderJid)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, You are not an admin in this group!_");
    }

    // Check bot admin status
    if (!await global.checkAdmin(msg, sock, groupId)) {
        return await reply(sock, groupId, msg, rawMessage, "_❌ Sorry, I am not an admin in this group!_");
    }

    const tempFile = `./src/gpp_${groupId.replace(/@/g, '_').replace(/\./g, '_')}.png`;

    try {
        let imageMsg = null;
        if (msg.quotedMessage) {
            if (msg.quotedMessage.imageMessage) {
                imageMsg = msg.quotedMessage.imageMessage;
            } else if (msg.quotedMessage.viewOnceMessageV2?.message?.imageMessage) {
                imageMsg = msg.quotedMessage.viewOnceMessageV2.message.imageMessage;
            }
        } else if (msg.message?.imageMessage) {
            imageMsg = msg.message.imageMessage;
        }

        if (!imageMsg) {
            return await reply(sock, groupId, msg, rawMessage, "_❌ Please reply to an image or upload an image with the command!_");
        }

        await reply(sock, groupId, msg, rawMessage, "_🔄 Downloading and setting the new group profile picture..._");
        await global.downloadMedia(imageMsg, "image", tempFile);

        if (!fs.existsSync(tempFile)) {
            throw new Error("Downloaded file not found.");
        }

        const imageBuffer = fs.readFileSync(tempFile);
        await sock.updateProfilePicture(groupId, imageBuffer);
        try { fs.unlinkSync(tempFile); } catch {}

        await reply(sock, groupId, msg, rawMessage, "🖼️ *Group Icon Changed Successfully!*");
    } catch (err) {
        console.error('[gpp] Error:', err);
        try { fs.unlinkSync(tempFile); } catch {}
        await reply(sock, groupId, msg, rawMessage, `_❌ Failed to change group profile picture: ${err.message || err}_`);
    }
}));