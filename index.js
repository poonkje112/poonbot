// DOCS https://discord.js.org/#/docs/main/stable/general/welcome

const Discord = require('discord.js');
const ytInfo = require('youtube-info');
const fs = require('fs');

const botInfo = require("./botInfo.json"); // Contains the token
const poonApi = require("./poonConfig.json"); // For downloading sound from yt videos
const botConfig = require("./botConfig.json");

let bot = new Discord.Client();

let servers = [];
let dispatchers = [];

bot.login(botInfo["token"]);

bot.on("ready", function() {
    console.log("Bot Loaded!");
});

bot.on("message", function(message) {
    if(message.author.equals(bot.user) || !message.content.startsWith(botConfig["prefix"])) return; // If the message is from the bot or does not start with the prefix then ignore it

    let args = message.content.substring(botConfig["prefix"].length).split(" "); // Removing the prefix and split all arguments into an array

    switch(args[0]) {
        case "ping": // Simple ping pong command
            message.channel.send("Pong!");
        break;
        
        case "info": // Some basic info about the bot
            let info = new Discord.MessageEmbed()
            .addField("Creator", "poonkje112")
            .addField("Bot Version", "2.0");
            message.channel.send(info);
        break;

        case "play": // Arguments: [1] url
        if(args[1] === undefined) { // Checking if an 2nd argument exists
            message.channel.send("Please provide an youtube video url");
            return;
        }

        ProcessSong(message, args[1]);
        break;

        case "skip":
            skip(message.guild.id);
            let skipMessage = new Discord.MessageEmbed()
            .addField("⏭ Music Queue", `${message.author} Has skipped to the next song`)
            .setColor("#fbc531");
            message.channel.send(skipMessage);
        break;

        case "clear":
            clear(message.guild.id, message.guild.voice.channel);
            let clearMessage = new Discord.MessageEmbed()
            .addField("❌ Music Queue", `${message.author} Has cleared the queue`)
            .setColor("#e84118");
            message.channel.send(clearMessage);
        break;
    }
});

bot.on("messageReactionAdd", function(reaction, user) {
    let server = servers[reaction.message.guild.id];
    if(server === undefined || user.bot || user.equals(bot.user)) return; // Checking if the server is available and if the reaction is not from the bot
    
    if(server.currentMessage === reaction.message.id) { // Checking if this is the most recent message from the queue
        switch(reaction._emoji.name) {
            case "⏭":
                skip(reaction.message.guild.id);
                let skipMessage = new Discord.MessageEmbed()
                .addField("⏭ Music Queue", `${user} Has skipped to the next song`)
                .setColor("#fbc531");
                reaction.message.channel.send(skipMessage);
            break;

            case "❌":
                clear(reaction.message.guild.id, reaction.message.guild.voice.channel);
                let clearMessage = new Discord.MessageEmbed()
                .addField("❌ Music Queue", `${user} Has cleared the queue`)
                .setColor("#e84118");
                reaction.message.channel.send(clearMessage);
            break;
        }
    }
});

function ProcessSong(message, url) {
    if(servers[message.guild.id] === undefined) servers[message.guild.id] = { queue: [] }; // If the queue does not exist for this guild, create it

    let server = servers[message.guild.id]; // Setting the server data to a variable so we can easily access it

    if(message.member.voice.channel) {  // Checking if the user is in a voice channel
        let videoId = getId(url); // Trying to get the video id from the url
        if(videoId === undefined) { // Checking if we successfuly got the video id
            let errorMessage = new Discord.MessageEmbed()
            .addField("🛑 Music Queue", "Invalid YouTube link!")
            .setColor("#e84118");
            message.channel.send(errorMessage);
            return;
        }
        
        server.queue.push({
            id: videoId,
            author: message.author
        }); // Add this id to the queue

        ytInfo(videoId, function(err, videoInfo) { // Simply getting some info from the video so we can send an confirmation including the video data
            let queueMessage = new Discord.MessageEmbed()
                .addField("🔼 Music Queue", `${message.author} Added [${videoInfo.title}](${videoInfo.url}) to the queue`)
                .setColor("#4cd137")
                .setFooter(`Position in queue: ${server.queue.length}`, "");

            message.channel.send(queueMessage);
        });
        
        if(!server.isPlaying) { // Simply checking if we are playing something, else we don't need to call play()
            PlaySong(message.guild.id, message);
        }
    } else {
        let voiceError = new Discord.MessageEmbed()
        .addField("🛑 Voice error", "You need to be in an voice channel!")
        .setColor("#e84118");
        message.channel.send(voiceError);
    }
}

function PlaySong(guildId, message) {
    let server = servers[guildId]; // Making our queue and stuff more accessible

    if(server == undefined || server.queue == undefined) return; // Checking if there is a queue available
    
    if(server.queue[0] == undefined) return; // Checking if something exists in the queue
    ytInfo(server.queue[0].id, function(err, videoInfo){      
        
        if(server.queue[0] == undefined) return; // Checking if something exists in the queue

        message.member.voice.channel.join().then(function(connection) {
            let broadcast;

            if(dispatchers[guildId] === undefined) {
                broadcast = bot.voice.createBroadcast();
                dispatchers[guildId] = broadcast;
            } else {
                broadcast = dispatchers[guildId];
            }

            let nowMessage = new Discord.MessageEmbed()
            .addField("▶️ Music Queue", `Now playing: [${videoInfo.title}](${videoInfo.url}) requested by ${server.queue[0].author}`)
            .setColor("#00a8ff")
            .setFooter(`Songs in queue: ${server.queue.length-1}`, "");

            message.channel.send(nowMessage).then(function(message) {
                message.react("❌")
                message.react("⏭");
                server.currentMessage = message.id;
            });
            
            server.isPlaying = true;
            broadcast.play(`http://api.poonkje.com/poonbot/ymp3/${server.queue[0].id}`);
            connection.play(broadcast);

            server.queue.shift();

            broadcast.dispatcher.once("finish", function() {
                broadcast.end();
            });

            broadcast.once("unsubscribe", function() {       
                if(server.queue == undefined) {
                    connection.disconnect();
                    return;
                }

                if(server.queue[0] != undefined) {
                    PlaySong(guildId, message);
                } else {
                    dispatchers[guildId] = undefined;
                    connection.disconnect();
                    clear(guildId, undefined);
                }
            });
        });
    });
}

function skip(guildId) {
    if(dispatchers[guildId] != undefined) {
        dispatchers[guildId].end();
    }
}

function clear(guildId, voice) {
    if(voice != undefined)
        voice.leave();

    let serverGuild = servers[guildId]; 

    if(serverGuild != undefined && serverGuild.queue != undefined) {
        servers[guildId].queue = undefined;
        servers[guildId] = undefined;
    }

    if(dispatchers[guildId] != undefined) {
        dispatchers[guildId].end();
    }
}

// Credits: https://stackoverflow.com/a/8260383/11424258
function getId(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match&&match[7].length==11)? match[7] : false;
}