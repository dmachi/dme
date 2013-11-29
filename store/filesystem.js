var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var All = require("promised-io/promise").all;
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
	var _self=this;	

	console.log("Looking for file: ", f);	
	fs.exists(f, function(exists){
		if (!exists) {
			return def.reject(new errors.NotFound(id + " - " + f));
		}
		if (id.charAt(id.length-1)=="/"){
			opts.req.templateId=opts.req.templateId + "-list";
			when(_self.query(id, {req:opts.req,res:opts.res,basePath:id}),function(results){
				return def.resolve(results);
			});
		}else{
			fs.realpath(f, function(err,resolved){
				if (err) { console.log("Unable to get absolute path of file"); };
				def.resolve({id: id, file: resolved});
			});
		}
	});

	return def.promise;

	
			
}

Store.prototype.query=function(query,opts){
	console.log("FS QUERY: ", query);
	var _self=this;
	var def = new defer();
	var results=[];
	var path = opts.basePath?(this.path + "/" + opts.basePath):this.path
	fs.readdir(path, function(err,files){
		if (err){ def.reject(err); }	
		console.log("d: ", files);
		var defs = [];

		files.forEach(function(f){
			var obj = {
				id: f,
			};
			
			var innerDef = defer();
			fs.stat(path +"/"+ f, function(err,s){
				if (err){return innerDef.reject(err); }
				for (var prop in s) {
					obj[prop]=s[prop];
				}
				obj.type = s.isDirectory()?"directory":"file";
				results.push(obj);
				innerDef.resolve(obj);
			});
			defs.push(innerDef.promise);
		})
		when(All(defs), function(){
			def.resolve(results);
		});
	});	
	return def.promise;
//	return ArrayQuery(query,opts,this.data);
}

Store.prototype.copy = function(input,output,data){
	var is = fs.createReadStream(input)
	var os = fs.createWriteStream(output);
	var d = new defer();

	os.on("finish", function(e){
		setTimeout(function(){
			d.resolve(true);
		},10);

		setTimeout(function(){
			fs.exists(input, function(exists){
				if (exists){return;}
				fs.unlink(input, function(err){
					if (err){
						console.log("Error removing temporary upload file",err);
						return;
					}
				});
			});
		},6000);

	});
	is.pipe(os);
	return d.promise;
}

Store.prototype.post=function(obj,opts){
	console.log("Filesystem post() Obj: ", obj);
	var def=new defer();
	var _self=this;
	var results=[];
	var defs=[];

	if (obj.files) {
		for (var prop in obj.files){
			var f = obj.files[prop];
			var fp = _self.path + "/" +  f.name;
			var def = new defer();
			if (fs.exists(fp, function(exists){
				if (exists){
					console.log("Overwriting file: ", fp);
					
				}
				console.log("Copy file: ", f.path, fp);
				var of = {
					id: f.name 
				};
		
	
				when(_self.copy(f.path,fp), function(res){
					console.log("Attempt stat: ", fp);	
						fs.stat(fp, function(err,s){
							if (err){return def.reject(err); }
							console.log("s: ", s);

							for (var fileprop in s) {
								of[fileprop]=s[fileprop];
							}
							of.type = s.isDirectory()?"directory":"file";
							console.log("OF:", of);
							def.resolve(of);
						});
				})

				results.push(of);
			}));

			defs.push(def);
		
		}
	}
	
	return when(All(defs), function(){
		console.log("Return results: ", results);
		return results;	
	});
}

Store.prototype.put=function(obj, opts){
}

Store.prototype.delete=function(id, opts){
	delete this.data[id];
	return true;
}
