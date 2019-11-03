var http = require('http');  
var express = require('express');  
var app = express();  
const httpsPort = 1234;  
var https = require('https');  
var fs = require('fs');  
var options = {  
    key: fs.readFileSync('./key.pem', 'utf8'),  
    cert: fs.readFileSync('./server.crt', 'utf8')  
};  
//console.log("KEY: ", options.key)  
//console.log("CERT: ", options.cert)  
var secureServer = https.createServer(options, app).listen(httpsPort, () => {  
    console.log(">> CentraliZr listening at port " + httpsPort);  
});  
app.get('/sach', function(req, res) {  
    res.sendFile(__dirname + '/public/index.html');  
});  