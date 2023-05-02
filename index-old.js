require('dotenv').config();
var express = require('express')
const fs = require('fs');
var app = require('express')();
const https = require('https');
var server = require('http').Server(app);
var serveIndex = require('serve-index');

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
var mysql = require('mysql');
var axios = require('axios')
var Redis = require('ioredis');
var redis = new Redis({
    host: 'lair-dev-api-redis.6rmkw6.0001.use1.cache.amazonaws.com',
    port: 6379,
    password: ''
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

function getUserByBearerToken(name, bearer, socket) {
    var config = {
      method: 'get',
      url: "https://dev.lair.gg/api/v1/lobbies/" + name + "/user",
      headers: { 
        'Accept': 'application/json', 
        'Authorization': 'Bearer ' + bearer
      }
    };

    axios(config)
    .then(function (response) {
    var user = response.data.data;
    user.avatar = process.env.BUCKET_PREFIX + user.avatar;
    users[user.id] = user;
    usersBySocketId[socket.id] = user;
    socket.join(name);
    console.log('joined', name, user);
    roomBySocketId[socket.id] = name;
    io.to(socket.id).emit('chat.identify', user);
    console.log('identify emitted');
    if (name in allMessages) {
        io.to(socket.id).emit('chat.messages', allMessages[name]);
	console.log('messages emitted');
        //io.to(message.room).emit('chat.messages', allMessages[message.room]);
    } else {
        allMessages[name] = [];
    }
    socket.broadcast.to(name).emit('chat.joined', user);

    })
    .catch(function (error) {
      console.log(error);
    });
}

function socketLeft(socket) {
    var user = usersBySocketId[socket.id];
    var room = roomBySocketId[socket.id];
    delete roomBySocketId[socket.id];
    delete usersBySocketId[socket.id];
    socket.leave(room);
    socket.broadcast.to(room).emit('chat.left', user);
}

/*
select("SELECT * FROM users", function (err, rows, fields) {
    console.log(err);
    console.log(rows);
    console.log(fields);
});
*/

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

server.listen(80);
httpsServer.listen(443);
app.use('/.well-known', express.static('.well-known'), serveIndex('.well-known'));
app.get('/', function(request, response) {
    //console.log(request.query.token);
    //response.render(__dirname + '/index.html', {token: request.query.token});
});
var allMessages = [];
var users = [];
var usersBySocketId = [];
var roomBySocketId = [];
io.on('connection', function(socket) {
    socket.on('chat.message', function(message) {
        if (typeof message == "string") {
            message = JSON.parse(message);
        }
        var newMessage = {};
        newMessage['user'] = usersBySocketId[socket.id];
        newMessage['text'] = message.text;
        newMessage['timestamp'] = new Date().getTime();
        allMessages[roomBySocketId[socket.id]].push(newMessage);
    	io.to(roomBySocketId[socket.id]).emit('chat.new_message', newMessage);
    });
    socket.on('chat.join', function(message) {
	console.log(typeof message);
	if (typeof message == "string") {
	    message = JSON.parse(message);
	}
	console.log(message.room);
        getUserByBearerToken(message.room, message.bearer, socket);
    });
    socket.on('chat.leave', function(message) {
        socketLeft(socket);
    });

    socket.on('disconnecting', function() {
        socketLeft(socket);
    });
});
