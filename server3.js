var fs = require("fs");
var http = require("http");

var sessions = {};

var server = http.Server(function (request, response) {
    var parts = request.url.split("/");
    switch (parts[1]) {
        case "":  // client code delivery
            fs.readFile("simple_client3.html", function (error, content) {
                if (error) {
                    response.writeHead(404);
                    response.end();
                    return;
                }
                response.writeHead(200, {"Content-Type": "text/html"});
                response.end(content);
            });
            break;

        case "stoc":  // server-to-client
            var sessionId = parts[2];
            var userId = parts[3];
            if (!sessionId || !userId) {
                response.writeHead(400);
                response.end();
                break;
            }
            console.log("@" + sessionId + " - " + userId + " joined.");

            response.writeHead(200, {"Content-Type": "text/event-stream"});
            function keepAlive(resp) {
                resp.write(":\n");
                resp.keepAliveTimer = setTimeout(arguments.callee, 30000, resp);
            }
            keepAlive(response);  // flush headers + keep-alive

            var session = sessions[sessionId];
            if (!session)
                session = sessions[sessionId] = {"users" : {}};

            var user = session.users[userId];
            if (!user) {
                user = session.users[userId] = {};
                for (var pname in session.users) {
                    var esResp = session.users[pname].esResponse;
                    if (esResp) {
                        clearTimeout(esResp.keepAliveTimer);
                        keepAlive(esResp);
                        esResp.write("event:join\ndata:" + userId + "\n\n");
                        response.write("event:join\ndata:" + pname + "\n\n");
                    }
                }
            }
            else if (user.esResponse) {
                user.esResponse.end();
                user.esResponse = null;
            }
            user.esResponse = response;

            request.on("close", function () {
                for (var pname in session.users) {
                    if (pname == userId)
                        continue;
                    var esResp = session.users[pname].esResponse;
                    esResp.write("event:leave\ndata:" + userId + "\n\n");
                }
                delete session.users[userId];
                console.log("@" + sessionId + " - " + userId + " left.");
            });
            break;

        case "ctos":  // client-to-server
            console.log("url: " + request.url);
            var sessionId = parts[2];
            var userId = parts[3];
            var peerId = parts[4];
            var peer;
            var session = sessions[sessionId];
            if (!session || !(peer = session.users[peerId])) {
                response.writeHead(400);
                response.end();
                break;
            }

            var body = "";
            request.on("data", function (data) { body += data; });
            request.on("end", function () {
                console.log("@" + sessionId + " - " + userId + " => " + peerId + " :");
                console.log(body);
                var evtdata = "data:" + body.replace(/\n/g, "\ndata:") + "\n";
                peer.esResponse.write("event:user-" + userId + "\n" + evtdata + "\n");
            });

            response.writeHead(204);
            response.end();
            break;

        default:
            response.writeHead(404);
            response.end();
    }
});
server.listen(8080);
