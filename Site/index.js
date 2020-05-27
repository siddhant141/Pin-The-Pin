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
    console.log("Listening at port " + httpsPort);  
});  
app.get('/sach', function(req, res) {  
    res.sendFile(__dirname + '/public/index.html');  
});
app.get('/acc',function(req,res){
	res.sendFile(__dirname+'/public/acc.html');
});

http.createServer(function (req, res) {
  fs.readFile('demofile1.html', function(err, data) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  });
}).listen(8080);