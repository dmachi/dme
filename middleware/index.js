var fs = require("fs-extra");
var debug = require("debug")("dme");
var Path = require("path");

var middleware = {};

fs.readdirSync(__dirname).filter(function(filename){ return filename.match(".js$") && (filename != "index.js") }).forEach(function(filename){
	var name = filename.replace(".js","");
	debug("Loading Middleware " + "./"+name + " from " + filename);
	middleware[name]=require("./" + name);
})

module.exports = middleware;