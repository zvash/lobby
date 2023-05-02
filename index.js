require('dotenv').config();
const {
    v1: uuidv1,
    v4: uuidv4,
} = require('uuid');

const globals = require('./globals');
var express = require('express')
const fs = require('fs');
var app = require('express')();
const https = require('https');
var server = require('http').Server(app);
var serveIndex = require('serve-index');
var env = process.env;

var isLocal = env.ENV == 'local';

if (!isLocal) {
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/lobby.dev.lair.gg/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/lobby.dev.lair.gg/cert.pem', 'utf8');
    const ca = fs.readFileSync('/etc/letsencrypt/live/lobby.dev.lair.gg/chain.pem', 'utf8');

    const credentials = {
        key: privateKey,
        cert: certificate,
        ca: ca
    };
    const httpsServer = https.createServer(credentials, app);

    var io = require('socket.io')(httpsServer, {
        cors: {
            origin: "*"
        }
    });

    httpsServer.listen(443);
    app.use('/.well-known', express.static('.well-known'), serveIndex('.well-known'));
} else {
    var io = require('socket.io')(server, {
        cors: {
            origin: "*"
        }
    });
}
server.listen(env.SERVER_PORT);

var mysql = require('mysql');
var Redis = require('ioredis');
var redis = new Redis({
    host: env.REDIS_HOST,
    port: 6379,
    password: env.REDIS_PASSWORD
});
var subscriberRedis = new Redis({
    host: env.REDIS_HOST,
    port: 6379,
    password: env.REDIS_PASSWORD
});
var pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

function select(statement, callback) {
    pool.query(statement, callback);
}


// function incr(redis, key, callback, params) {
//     redis.incr(key, function(err, value) {
//         if (err) {
//             console.log('redis error', err);
//         }
//         callback(key, value, params);
//     });
// }
//
// function decr(redis, key, callback, params) {
//     redis.decr(key, function(err, value) {
//         if (err) {
//             console.log('redis error', err);
//         }
//         callback(key, value, params);
//     });
// }
//
// function get(redis, key, callback, params) {
//     redis.get(key, function(err, value) {
//         if (err) {
//             console.log('redis error', err);
//         }
//         callback(key, value, params);
//     });
// }
//
// function set(redis, key, callback, params) {
//     redis.set(key, function(err, value) {
//         if (err) {
//             console.log('redis error', err);
//         }
//         callback(key, value, params);
//     });
// }

subscriberRedis.subscribe("lairgg_lobby-server-message-channel", 'lairgg_lobby-server-edit-message-channel', 'lairgg_lobby-server-pick-and-ban-timeout-channel', 'lairgg_lobby-server-internal-message-channel', 'lairgg_lobby-initiate-pre-match-preparation-channel', (err, count) => {
    if (err) {
        console.error("Failed to subscribe: %s", err.message);
    } else {

    }
});

subscriberRedis.on("message", (channel, message) => {
    
    if (channel == 'lairgg_lobby-server-message-channel') {
        var newMessage = JSON.parse(message);
        var roomName = newMessage['lobby_name'];
        globals.addNewMessage(roomName, newMessage);
        io.to(roomName).emit('chat.new_message', newMessage);
    } else if (channel == 'lairgg_lobby-server-edit-message-channel') {
        var editedMessage = JSON.parse(message);
        var roomName = editedMessage['lobby_name'];
        for (index in globals.allMessages[roomName]) {
            if (globals.allMessages[roomName][index]['uuid'] == editedMessage['uuid']) {
                
                globals.allMessages[roomName][index] = editedMessage;
                io.to(roomName).emit('chat.edit_message', editedMessage);
                break;
            }
        }
    } else if (channel == 'lairgg_lobby-server-pick-and-ban-timeout-channel') {
        var timeoutMessage = JSON.parse(message);
        if (timeoutMessage['id'] in globals.pickAndBanTimeout) {
            clearTimeout(globals.pickAndBanTimeout[timeoutMessage['id']]);
        }
        
        globals.pickAndBanTimeout[timeoutMessage['id']] = setTimeout(function(r, m) {
            
            r.publish('lairgg_lobby-pick-and-ban-message-channel', JSON.stringify(m));

        }, (timeoutMessage['deadline'] - Math.ceil(Date.now() / 1000) + 1.5) * 1000, redis, timeoutMessage);

    } else if (channel == 'lairgg_lobby-server-internal-message-channel') {

        var internalMessage = JSON.parse(message);
        var roomName = internalMessage['lobby_name'];
        io.to(roomName).emit('chat.internal_message', internalMessage);

    } else if (channel == 'lairgg_lobby-initiate-pre-match-preparation-channel') {

        redis.publish('lairgg_lobby-fire-up-pre-match-preparation-channel', message);

    }
});

io.on('connection', function (socket) {

    socket.on('chat.message', function (message) {
        if (typeof message == "string") {
            message = JSON.parse(message);
        }
        var newMessage = {};
        newMessage['user'] = globals.usersBySocketId[socket.id];
        newMessage['text'] = message.text;
        newMessage['timestamp'] = Math.floor((new Date().getTime()) / 1000);
        newMessage['uuid'] = uuidv4();
        newMessage['type'] = 'text';
        newMessage['lobby_name'] = globals.roomBySocketId[socket.id];
        globals.addNewMessage(globals.roomBySocketId[socket.id], newMessage);
        io.to(globals.roomBySocketId[socket.id]).emit('chat.new_message', newMessage);
        redis.publish('lairgg_lobby-message-channel', JSON.stringify(newMessage));
    });
    socket.on('chat.join', function (message) {
        
        if (typeof message == "string") {
            message = JSON.parse(message);
        }

        globals.getUserByBearerToken(message.room, message.bearer, socket, io, redis);
    });
    socket.on('chat.leave', function (message) {
        globals.socketLeft(socket, redis);
    });

    socket.on('disconnecting', function () {
        globals.socketLeft(socket, redis);
    });
});
