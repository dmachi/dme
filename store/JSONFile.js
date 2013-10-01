var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ArrayQuery = require("rql/js-array").query;
var fs = require("fs");
var readline = require("readline");

var Store = exports.Store= function(id,options){
	this.id = id;
	var _self=this;
	this.opts = options||{};
	this.filename = this.opts.filename || this.id + ".json";
	this.filePath = this.opts.path || "./";
	this._countID=111111;
	this.ready=false;
	this.data = []; 
	this.index={};

	console.log("Checking for data file: ", this.filePath + this.filename);

	fs.exists(this.filePath + this.filename, function(exists){
		console.log("fs exists cb: ", exists);
		if (exists){
			console.log("File Exists.  Loading index data");
			var input = fs.createReadStream(_self.filePath + _self.filename, {flags: "r","encoding":"utf8",autoClose:true}) ;
			console.log("Indexing Data from ", _self.filePath + _self.filename);
			input.on('open', function(){
			        var openings=0;
				var firstRun=true;
				var closings=0;
				var dataString="";
				input.on("data", function(chunk){
					for (var i=0;i<chunk.length;i++){
						var c = chunk.charAt(i);
						if (c=="{"){
							openings++;
							firstRun=false;
						}
						if (c=="}"){
							openings--;
						}
						if (!firstRun && c) { dataString+=c; }
						if (!firstRun && openings===0){
			                                var obj = JSON.parse(dataString);
							dataString=""
			                                firstRun=true;
							_self.index[obj.id]=obj;
							_self.data.push(obj);
						}
       		         	}
				});
			});
		
			input.on("error", function(err){
				console.log("Error: ", err);
			});
			input.on("end", function(){
				console.log("File Read Complete");
				_self.ready=true;
			});	
		}else{
			console.log("File does not exist, using empty index.");
			_self.ready=true;
		}
	})
}

util.inherits(Store, StoreBase);

Store.prototype.get = function(id,opts){
	return this.index[id];
}

Store.prototype.query=function(query,opts){
	return ArrayQuery(query,opts,this.data);
}

Store.prototype.post=function(obj,opts){
	if (obj.id){
		for (prop in obj){
			this.data[id][prop] = obj[prop];
		}
	}
	return this.put(this.data[id],opts);
}

Store.prototype.put=function(obj, opts){
	if (!obj.id){
		obj.id=this._countID++;
	}

	this.data[obj.id]=obj;	

	this.persist();
	return obj;
}

Store.prototype.delete=function(id, opts){
	delete this.data[id];
	return true;
}

Store.prototype.persist = function(){
	var count=0;
	var keys = Object.keys(this.data);
	var _self=this;
	var tempFile= fs.createWriteStream(this.filePath + this.filename + ".tmp",{flags: 'w',encoding:"utf-8"}); //this.filePath + this.filename, {flags:"w"});
	tempFile.on("open", function(fd){
		tempFile.write("[");
		console.log("keys: ", keys);		
		keys.forEach(function(key, index) {
			console.log(key, index, _self.data[key]);
			var obj = _self.data[key];
//			console.log("obj: ",obj);
			count++;
			var output = JSON.stringify(obj);
			console.log("WRITE: ", output);
//			var output = output + (index==(keys.length-1))?"]":",\n";
			console.log("OUTPUT: ", output);
			tempFile.write(output);
		});
		tempFile.write(']');
		var hasError=false;
		tempFile.on("error", function(err){
			hasError=true;
			console.error("Error Persisting Data", err);
		});
		tempFile.end();

		if (!hasError){
			fs.exists(_self.filePath + _self.filename, function(exists) {
				if (exists) {	
					fs.unlink(_self.filePath + _self.filename, function(err){
						if (err) { console.log("Unalbe to unlink existing json file"); return; }
						fs.rename(tempFile, _self.filePath + _self.filename, function(err){
							if (!err) {
								console.log(" " + count-1 +  "Objects Persisted to written to "+ _self.filePath + _self.filename);
							}
						});
					});
				}else{
						fs.rename(_self.filePath+_self.filename+".tmp", _self.filePath + _self.filename, function(err){
							if (!err) {
								console.log(" " + count-1 +  "Objects Persisted to written to "+ _self.filePath + _self.filename);
							}
						});
				}
				
			});
		}
	
	})
}
