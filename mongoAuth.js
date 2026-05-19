const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { proto } = require('@whiskeysockets/baileys/lib/Types');

/**
 * Creates an authentication state that saves keys and creds to a MongoDB collection.
 * 
 * @param {import('mongodb').Collection} collection - The MongoDB collection to store auth data.
 */
const useMongoDBAuthState = async (collection) => {
    const writeData = async (data, id) => {
        try {
            const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            await collection.replaceOne({ _id: id }, serialized, { upsert: true });
        } catch (error) {
            console.error(`[MongoDB] Error writing ${id}:`, error);
        }
    };

    const readData = async (id) => {
        try {
            const data = await collection.findOne({ _id: id });
            if (data) {
                // Remove the _id before reviving
                delete data._id;
                return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`[MongoDB] Error reading ${id}:`, error);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await collection.deleteOne({ _id: id });
        } catch (error) {
            console.error(`[MongoDB] Error removing ${id}:`, error);
        }
    };

    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        }
    };
};

module.exports = { useMongoDBAuthState };
