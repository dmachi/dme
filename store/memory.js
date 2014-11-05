var debug=require('debug')("dme:store:memory");
var parser = require("rql/parser");
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var declare = require("dojo-declare/declare");
var Store = require("../Store");
var Query = require("rql/js-array").executeQuery;
var fs = require("fs-extra");
var Path = require("path");
var stream = require('stream');

module.exports = declare([Store], {
	"primaryKey": "id",
	"dataDirectory": "data",
	"init": function(){
		this._data = [];
		this._byId = {};
		this.loadOrCreateFile()
	},

	loadOrCreateFile: function(){
		var dir = this.dataDirectory;
		var filename = Path.join(dir,this.id+".json-updlog");
		debug("Looking for ", filename)
		var _self=this;
		fs.exists(filename,function(exists){
			if (exists){
				_self.loadFileIntoIndex()
			}
		})
	},

	"loadFileIntoIndex": function(){
		var dataDir = Path.join(this.dataDirectory,this.id+".json-updlog")
		debug("Loading file into index: ",dataDir )
		var _self=this;
		var liner = new stream.Transform( { objectMode: true } )
		 
		liner._transform = function (chunk, encoding, done) {
			var data = chunk.toString()
			if (this._lastLineData) data = this._lastLineData + data

			var lines = data.split('\n')
			this._lastLineData = lines.splice(lines.length-1,1)[0]

			lines.forEach(this.push.bind(this))
			done()
		}
		 
		liner._flush = function (done) {
		     if (this._lastLineData) this.push(this._lastLineData)
		     this._lastLineData = null
		     done()
		}

		// debug("Create Read Strema")
		var source = fs.createReadStream(dataDir)
 		source.pipe(liner);
 		liner.on("readable", function(){
 			var line;
 			while (line = liner.read()) {
				//debug("Line: ", line)
 				if (!line) { /*debug("Skipping empty line"); */continue;}
 				var p = JSON.parse(line);
 				if (p.__deleted){
 					_self.delete(p[_self.primaryKey],{indexOnly:true});
 				}else{
 					_self.put(JSON.parse(line),{overwrite:true,indexOnly:true});
 				}
 			}
 		})
	},

	"setSchema":function(schema){
		this.schema=schema;
	},

	"parseQuery": function(query,opts){
		// IMPLEMENT IN SUBCLASS		
	},

	"get":function(id,opts){
		debug("GET: ", id, this._byId[id]?"Not Found":this._byId[id])
		return {results: this._byId[id], metadata: {}}
	},

	"query":function(query, opts){
		// query = query || "";
		debug("QUERY: '" + query + "'");
		var results = Query(query,{}, this._data);

		debug("Results: ", results);
		return {results: results, metadata: {totalCount: results.length}}
	},

	"post": function(obj,opts){
		debug("POST: ", obj)
		return this.put(obj,{overwrite:true});
	},

	"put":function(obj, opts){
		debug("PUT: ", obj);
		var id = obj[this.primaryKey] || opts.id;
		if (!opts.overwrite && this._byId[id]) {
			throw Error("Object Already Exists")
		}else{
			var up=false;

			if (this._byId[id]){
				up=true	
			}
			obj[this.primaryKey] = id;
			var cur;
			if (!up){
				cur = this._byId[id] = obj;
				this._data.push(obj);
			}else{
				cur = this._byId[id];
				Object.keys(obj).forEach(function(key){ cur[key]=obj[key] });
			}
			if (!opts || !opts.indexOnly){
				fs.appendFile(Path.join(this.dataDirectory,this.id+".json-updlog"),JSON.stringify(cur)+"\n", function(err){
					if (err){
						debug("Unable to Append data to update log file",err);
					}
				})
			}
		}
	},

	"delete": function(id, opts){
		debug("DELETE: ", id)
		if (this._byId[id]){
			var o = this._byId[id];
			this._data = this._data.filter(function(a){ return a!==o },this);	
			delete this._byId[id];	
			var del={__deleted: true}
			del[this.primaryKey]=id;

			if (!opts || !opts.indexOnly){
				fs.appendFile(Path.join(this.dataDirectory,this.id+".json-updlog"),JSON.stringify(del)+"\n", function(err){
					if (err){
						debug("Unable to Append data to update log file",err);
					}
				})
			}
		}
	}
});
