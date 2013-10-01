var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ArrayQuery = require("rql/js-array").query;
var fs = require('fs');
var errors = require("../errors");

var Store = exports.Store= function(id,options){
	options = options || {}
	this.id = id;
	this.opts = options;
	this.path = options.path || "./data/"+id;
	var _self=this;
	console.log("Filesystem Store Path: ", this.path);
	var parts = this.path.split("/");
	var pathParts = [];
	var fp;

	parts.forEach(function(p){
		pathParts.push(p);
		var fp = pathParts.join("/");
		if ((!fs.existsSync(fp)) && (fp !=".")){
			fs.mkdir(fp, [0755], function(err){
				if (err){
					console.log("Unable to create directory: ", err);
				}
			})	

		}
	});

	this._countID=111111;
}

util.inherits(Store, StoreBase);

Store.prototype.get = function(id,opts){
	console.log("FS GET: ", id);
	var f = [this.path, id].join("/");
	console.log("File: ", f);
	var def = new defer();

	fs.exists(f, function(exists){
		if (!exists) {
			return def.reject(new errors.NotFound(id + " - " + f));
		}
		def.resolve({id: id, file: f});
	});

	return def.promise;

	
			
}

Store.prototype.query=function(query,opts){
	console.log("FS QUERY: ", query);
	return ArrayQuery(query,opts,this.data);
}

Store.prototype.post=function(obj,opts){
	return obj;
}

Store.prototype.put=function(obj, opts){
}

Store.prototype.delete=function(id, opts){
	delete this.data[id];
	return true;
}
