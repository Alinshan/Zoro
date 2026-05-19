const axios = require('axios');
const cheerio = require('cheerio');
var FormData = require('form-data');

/**
 * Search for a game on game system requirements and return the first game found
 * @param {string} gameName - name of the game to search for
 * @returns {Promise<string>} - first game found, or empty string if not found
 */
async function searchGame(gameName) {
     const apiUrl = "https://gamesystemrequirements.com/search?q=" + encodeURIComponent(gameName) + "&w=1&method=AND"
     var response = await axios.get(apiUrl);
     response = response.data;
     var $ = cheerio.load(response);
     var tables = [];
     var games = [];
     $('tr').each((index, row) => {
          tables.push($(row).html());
     });
     tables.forEach(table => {
          if (table.includes("/game/")) {
               games.push(table.split('href="')[1].split('"')[0]);
          }
     });
     return games[0];
}

/**
 * Search for a CPU on game system requirements and return the first CPU found
 * @param {string} cpuName - name of the CPU to search for
 * @returns {Promise<object>} - first CPU found, or an object with {cpu: "not found", id: 0} if not found
 */
async function searchCPU(cpuName) {
     var data = await axios.get("https://gamesystemrequirements.com/cpu_search.php?q=" + encodeURIComponent(cpuName), {headers: {"x-requested-with": "XMLHttpRequest"}})
     data = data.data;
     if (Number(data.total_count) == 0) return {cpu: "not found", id: 0}
     return {cpu: data.items[0].full_name, id: Number(data.items[0].id)}
}


/**
 * Search for a GPU on game system requirements and return the first GPU found
 * @param {string} gpuName - name of the GPU to search for
 * @returns {Promise<object>} - first GPU found, or an object with {gpu: "not found", id: 0} if not found
 */
async function searchGPU(gpuName) {
     var data = await axios.get("https://gamesystemrequirements.com/gpu_search.php?q=" + encodeURIComponent(gpuName), {headers: {"x-requested-with": "XMLHttpRequest"}});
     data = data.data;
     if (Number(data.total_count) == 0) return {gpu: "not found", id: 0}
     return {gpu: data.items[0].full_name, id: Number(data.items[0].id)}
}

/**
 * Retrieves the average FPS for a given game URL, CPU, and GPU.
 * The function returns a string containing the average FPS for each resolution.
 * The string is formatted as follows: "Resolution: Quality :: FPS\n".
 * The resolutions are ordered from lowest to highest.
 * @param {string} url - URL of the game to retrieve the average FPS for.
 * @param {object} cpu - CPU to use for the average FPS calculation.
 * @param {object} gpu - GPU to use for the average FPS calculation.
 * @returns {Promise<string>} - A string containing the average FPS for each resolution.
 */
async function getAvarageFPS(url, cpu, gpu, ram) {

     var formData = new FormData();
     formData.append('device_id', "0");
     formData.append('compare', "Compare");
     formData.append('cpu', cpu.id);
     formData.append('gpu', gpu.id);
     formData.append('os', "641110");
     formData.append('cpuoc', "0");
     formData.append('vram', "0");
     formData.append('gpuoc', "0");
     formData.append('vcn', "1");
     formData.append('ram', String(ram));

     var data = await axios({
          url: url,
          method: "POST",
          data: formData,
          headers: formData.getHeaders()
     })
     data = data.data;

     const $ = cheerio.load(data);
     const results = [];
     $('.main-panel').each((index, panel) => {
         $(panel).find('.panel-title').each((i, title) => {
             const titleText = $(title).text().trim();
             if (titleText.includes("Expected fps:")) {
                    const srbrTabContent = $(panel).find('.srbr_tab').html();
                    results.push({
                         expectedFps: titleText,
                         srbrTab: srbrTabContent ? srbrTabContent.trim() : "Not Found"
                    });
               }
          });
     });

     const $2 = cheerio.load(results[0].srbrTab);
     const jsonResult = {
         resolutions: [],
         fps_data: []
     };
     
     $2('.srbr_row').first().find('.srbr_hc.center_text').each((i, el) => {
         jsonResult.resolutions.push($(el).text().replace(/\n/g, ' ').trim());
     });
     
     $2('.srbr_row').slice(1).each((i, row) => {
         const quality = $(row).find('.srbr_hc').first().text().trim();
         const fps = $(row).find('.srbr_cell.center_text').map((j, cell) => $(cell).text().trim()).get();
         
         jsonResult.fps_data.push({ quality, fps });
     });

     /**
      * Converts the given data to a string containing the average FPS for each resolution.
      * The string is formatted as follows: "Resolution: Quality :: FPS\n".
      * The resolutions are ordered from lowest to highest.
      * @param {object} data - The data to convert to a string.
      * @returns {string} - A string containing the average FPS for each resolution.
      */
     function convertToText(data) {
          let textOutput = "";
          data.resolutions.forEach((resolution, index) => {
              textOutput += `\n[${resolution.toUpperCase()}]\n`;
              data.fps_data.forEach(row => {
                  textOutput += `${row.quality} :: ${row.fps[index]}\n`;
              });
          });
          return textOutput;
     }
     const textOutput = convertToText(jsonResult);
     return textOutput;
}

// number to gb converter
/**
 * Converts the given GB value to the nearest available GB value.
 * If the input is not a number, it returns 16384 (16 GB).
 * If the input is less than 2 GB, it returns 2 GB.
 * If the input is greater than 64 GB, it returns 64 GB.
 * The available GB values are: 2, 4, 6, 8, 12, 16, 24, 32, 64.
 * If the input is not one of these values, it returns the closest available value.
 * @param {number} gb - The GB value to convert.
 * @returns {number} - The converted GB value in bytes.
 */
function gbToNumber(gb) {
     if (typeof gb !== "number") return 16 * 1024;
     if (gb < 2) gb = 2
     if (gb > 64) gb = 64
     var availableGb = [2, 4, 6, 8, 12, 16, 24, 32, 64]
     if (!availableGb.includes(gb)) {
          var closest = availableGb.reduce((prev, curr) => {
               return (Math.abs(curr - gb) < Math.abs(prev - gb) ? curr : prev);
          });
          gb = closest;
     }
     return gb * 1024;
}

addCommand({ pattern: "^gamefps ?(.*)$", access: "all", desc: "_Get the average FPS of a game on your system._", pluginVersion: "1.0.0", pluginId: "gamefps" }, async (msg, match, sock, rawMessage) => {

     var example =  "\n\n_Example:_ ```" + global.handlers[0] + "gamefps cyberpunk - 12500 - 4060 ti - 16```";
     if (!match[1]) {
          if (msg.key.fromMe) {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_Please enter a game name, CPU, GPU, and RAM separated by -._" + example, edit: msg.key });
          } else {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_Please enter a game name, CPU, GPU, and RAM separated by -._" + example }, { quoted: rawMessage.messages[0] });
          }
     }

     var configs = match[1].split("-")
     if (configs.length != 4) {
          if (msg.key.fromMe) {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_Please enter a game name, CPU, GPU, and RAM separated by -._" + example, edit: msg.key });
          } else {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_Please enter a game name, CPU, GPU, and RAM separated by -._" + example }, { quoted: rawMessage.messages[0] });
          }
     }
     configs.forEach((config, index) => {
          configs[index] = config.trim();
     });

     if (msg.key.fromMe) {
          await sock.sendMessage(msg.key.remoteJid, { text: "_Searching for game..._", edit: msg.key });
     } else {
          var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_Searching for game..._" }, { quoted: rawMessage.messages[0] });
     }
     var game = configs[0];
     var cpu = configs[1];
     var gpu1 = configs[2];
     var ram = gbToNumber(Number(configs[3]));

     var game2 = await searchGame(game);
     if (!game2 || game2[0] == undefined) {
          if (msg.key.fromMe) {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_Game not found._" + example, edit: msg.key });
          } else {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_Game not found._" + example, edit: publicMessage.key });
          }
     }
     var cpu2 = await searchCPU(cpu);
     if (cpu2.id == 0) {
          if (msg.key.fromMe) {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_CPU not found._" + example, edit: msg.key });
          } else {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_CPU not found._" + example, edit: publicMessage.key });
          }
     }
     var gpu22 = await searchGPU(gpu1);
     if (gpu22.id == 0) {
          if (msg.key.fromMe) {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_GPU not found._" + example, edit: msg.key });
          } else {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_GPU not found._" + example, edit: publicMessage.key });
          }
     }
     try {
          var fps = await getAvarageFPS(game2, cpu2, gpu22, ram);
     } catch {
          var fps = "Not Available";
     }

     fps = fps.trimStart();
     if (fps == "Not Available") {
          if (msg.key.fromMe) {
               var findedGame = game2.split("/game/")[1].replace(/-/g, " ")
               findedGame = findedGame.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
               return await sock.sendMessage(msg.key.remoteJid, { text: "_This game has not been supported!_\n\n*Game:* " + findedGame, edit: msg.key });
          } else {
               return await sock.sendMessage(msg.key.remoteJid, { text: "_This game has not been supported!_\n\n*Game:* " + findedGame, edit: publicMessage.key });
          }
     }

     var findedGame = game2.split("/game/")[1].replace(/-/g, " ")
     findedGame = findedGame.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());

     fps = "*" + findedGame + "*\n\n" + "*CPU ::* " + cpu2.cpu + "\n*GPU:* " + gpu22.gpu + "\n*RAM:* " + configs[3] + " GB\n\n" + fps;

     if (msg.key.fromMe) {
          return await sock.sendMessage(msg.key.remoteJid, { text: fps, edit: msg.key });
     } else {
          return await sock.sendMessage(msg.key.remoteJid, { text: fps, edit: publicMessage.key });
     }
});