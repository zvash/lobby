require('dotenv').config();
var axios = require('axios');
var env = process.env;
var allMessages = [];
var users = [];
var usersBySocketId = [];
var roomBySocketId = [];
var socketIdByRoom = [];
var pickAndBanTimeout = {};
module.exports = {
    getUserByBearerToken: function (name, bearer, socket, io, redis) {
        var config = {
            method: 'get',
            url: env.APP_URL + "/api/v1/lobbies/" + name + "/user",
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + bearer
            }
        };

        axios(config)
            .then(function (response) {
                var user = response.data.data;
                if (user.avatar) {
                    user.avatar = process.env.BUCKET_PREFIX + '/' + user.avatar;
                }
                if (user.team) {
                    if (user.team.logo) {
                        user.team.logo = process.env.BUCKET_PREFIX + '/' + user.team.logo;
                    }
                    if (user.team.cover) {
                        user.team.cover = process.env.BUCKET_PREFIX + '/' + user.team.cover;
                    }
                }
                users[user.id] = user;
                usersBySocketId[socket.id] = user;
                socket.join(name);
                console.log('joined');
                roomBySocketId[socket.id] = name;
                socketIdByRoom[name] = socket.id;
                io.to(socket.id).emit('chat.identify', user);
                console.log('identify emitted');
                if (name in allMessages) {
                    io.to(socket.id).emit('chat.messages', allMessages[name]);
                    console.log('messages emitted');
                    //io.to(message.room).emit('chat.messages', allMessages[message.room]);
                } else {
                    var config = {
                        method: 'get',
                        url: env.APP_URL + "/api/v1/lobbies/" + name + "/latest",
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': 'Bearer ' + bearer
                        }
                    };
                    axios(config)
                        .then(function (response) {
                            allMessages[name] = response.data.data;
                            io.to(socket.id).emit('chat.messages', allMessages[name]);
                            console.log('messages emitted');
                        });
                    allMessages[name] = [];
                }
                socket.broadcast.to(name).emit('chat.joined', user);
                var presentObject = {
                    'user_id': user.id,
                    'name': name,
                    'is_present': true
                };
                console.log(presentObject);
                redis.publish('lairgg_lobby-presentation-and-status-channel', JSON.stringify(presentObject));

            })
            .catch(function (error) {
                console.log(error);
            });
    },
    socketLeft: function (socket, redis) {
        var user = usersBySocketId[socket.id];
        var room = roomBySocketId[socket.id];
        delete roomBySocketId[socket.id];
        delete socketIdByRoom[room];
        delete usersBySocketId[socket.id];
        socket.leave(room);
        socket.broadcast.to(room).emit('chat.left', user);
        var presentObject = {
            'user_id': user.id,
            'name': room,
            'is_present': false
        };
        redis.publish('lairgg_lobby-presentation-and-status-channel', JSON.stringify(presentObject));
    },
    addNewMessage: function (name, newMessage) {
        try {
            if (! name in allMessages) {
                allMessages[name] = [];
            }
            if (! allMessages[name]) {
                allMessages[name] = [];
            }
            while (allMessages[name] && allMessages[name].length > 19) {
                allMessages[name].shift();
            }
            allMessages[name].push(newMessage);
        } catch (e) {
            console.log(e);
        }
    },
    allMessages: allMessages,
    users: users,
    usersBySocketId: usersBySocketId,
    roomBySocketId: roomBySocketId,
    socketIdByRoom: socketIdByRoom,
    pickAndBanTimeout: pickAndBanTimeout
}