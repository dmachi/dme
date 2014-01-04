var StoreBase=require("../Store").Store;
var MongoClient = require("mongodb").MongoClient;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var LazyArray = require("promised-io/lazy-array").LazyArray;
var randomstring = require("randomstring");
var parser = require("rql/parser");

var Store = exports.Store= function(id,opts){
	this.opts=opts||{};
	this.id= id;
	var _self=this;
	if (!opts.url){
		throw new Error("No Connection URL Provided to Data Model");
	}	

	var def = new defer();
	MongoClient.connect(this.opts.url, function(err, db) {
		if (err) { console.log("Error connecting to ", _self.id, " Data Store", err);def.reject(err);return}
		_self.db = db;	
		_self.collection = db.collection(_self.id);
		console.log("MongoDB Store Collection: ", _self.id);	
		def.resolve(true);
	});
	this.connectDeferred = def.promise;
}

util.inherits(Store, StoreBase);

Store.prototype.authConfigProperty = "mongo";

Store.prototype.setSchema= function(schema){
	var _self=this;
	this.schema=schema;
	when(this.connectDeferred, function(){
		if (!_self.schema || !_self.schema.properties) { return; }
		for (p in _self.schema.properties){
			var prop = _self.schema.properties[p];
			if (prop.indexed){
				console.log("\tEnsure Index: ",p, prop);
				_self.collection.ensureIndex(p, function(r){
					//TODO push all these callbacks into a deferred list and callback when done
				});
			}
		}
	});
}
Store.prototype.get = function(id, options){
	var def = new defer();
	var cursor = this.collection.find({id: id}).limit(1).toArray(function(err,docs){
		var obj = docs[0];
		if (err) { console.log("MONGO DB GET ERROR: ", err); def.reject(err);return; }
		if (obj && obj._id) { delete obj._id; }
		def.resolve(obj);	
	});
	return def.promise;
}

Store.prototype.parseQuery=function(query, opts) {
	//console.log("parseQuery: ", query);
	var options = {
		skip: 0,
		limit: +Infinity,
		lastSkip: 0,
		lastLimit: +Infinity
	};
	var search = {};

	if (typeof query == "string"){
		if (query.charAt(0)=="?"){
			query = query.substr(1);
		}
		query = parser.parse(query);	
	}

	
	function walk(name, terms) {
		// valid funcs
		var valid_funcs = ['lt','lte','gt','gte','ne','in','nin','not','mod','all','size','exists','type','elemMatch'];
		// funcs which definitely require array arguments
		var requires_array = ['in','nin','all','mod'];
		// funcs acting as operators
		var valid_operators = ['or', 'and'];//, 'xor'];
		// compiled search conditions
		var search = {};
		// iterate over terms
		if (!terms) {return;}
		terms.forEach(function(term){
			var func = term.name;
			var args = term.args;
			// ignore bad terms
			// N.B. this filters quirky terms such as for ?or(1,2) -- term here is a plain value
			if (!func || !args) return;
			//dir(['W:', func, args]);
			// process well-known functions
			// http://www.mongodb.org/display/DOCS/Querying
			if (func == 'sort' && args.length > 0) {
				//console.log("SORT", func, args);
				options.sort = args.map(function(sortAttribute){
					var firstChar = sortAttribute.charAt(0);
					var orderDir = 'ascending';
					if (firstChar == '-' || firstChar == '+') {
						if (firstChar == '-') {
							orderDir = 'descending';
						}
						sortAttribute = sortAttribute.substring(1);
					}
					return [sortAttribute, orderDir];
				});
			} else if (func == 'select') {
				options.fields = args;
			} else if (func == 'values') {
				options.unhash = true;
				options.fields = args;
				// N.B. mongo has $slice but so far we don't allow it
			/*} else if (func == 'slice') {
				//options[args.shift()] = {'$slice': args.length > 1 ? args : args[0]};*/
			} else if (func == 'limit') {
				// we calculate limit(s) combination
				options.lastSkip = options.skip;
				options.lastLimit = options.limit;
				// TODO: validate args, negative args
				var l = args[0] || Infinity, s = args[1] || 0;
				// N.B: so far the last seen limit() contains Infinity
				options.totalCount = args[2];
				if (l <= 0) l = 0;
				if (s > 0) options.skip += s, options.limit -= s;
				if (l < options.limit) options.limit = l;
			// grouping
			} else if (func == 'group') {
				// TODO:
			// nested terms? -> recurse
			} else if (args[0] && typeof args[0] === 'object') {
				if (valid_operators.indexOf(func) > -1)
					search['$'+func] = walk(func, args);
					// N.B. here we encountered a custom function
					// ...
					// structured query syntax
					// http://www.mongodb.org/display/DOCS/Advanced+Queries
				} else {
					//dir(['F:', func, args]);
					// mongo specialty
					if (func == 'le') func = 'lte';
					else if (func == 'ge') func = 'gte';
						// the args[0] is the name of the property
					var key = args.shift();
					// the rest args are parameters to func()
					if (requires_array.indexOf(func) >= 0) {
						args = args[0];
					} else {
						// FIXME: do we really need to .join()?!
						args = args.length == 1 ? args[0] : args.join();
					}
					// regexps:
					if (typeof args === 'string' && args.indexOf('re:') === 0)
						args = new RegExp(args.substr(3), 'i');
						// regexp inequality means negation of equality
					if (func == 'ne' && args instanceof RegExp) {
						func = 'not';
					}
					// TODO: contains() can be used as poorman regexp
					// E.g. contains(prop,a,bb,ccc) means prop.indexOf('a') >= 0 || prop.indexOf('bb') >= 0 || prop.indexOf('ccc') >= 0
					//if (func == 'contains') {
					//	// ...
					//}
					// valid functions are prepended with $
					if (valid_funcs.indexOf(func) > -1) {
						func = '$'+func;
					}
					// $or requires an array of conditions
					// N.B. $or is said available for mongodb >= 1.5.1
					if (name == 'or') {
						if (!(search instanceof Array))
							search = [];
						var x = {};
						x[func == 'eq' ? key : func] = args;
						search.push(x);
						// other functions pack conditions into object
					} else {
						// several conditions on the same property is merged into one object condition
						if (search[key] === undefined)
							search[key] = {};
						if (search[key] instanceof Object && !(search[key] instanceof Array))
							search[key][func] = args;
						// equality cancels all other conditions
						if (func == 'eq')
							search[key] = args;
					}
				}
				// TODO: add support for query expressions as Javascript
		});
		return search;
	}
//	console.log('Q:',JSON.stringify(query));
	search = walk(query.name, query.args);
	return [options, search];
}
Store.prototype.query= function(query, opts){

	var _self=this;
	//console.log("query: ", query);
	var x = this.parseQuery(query);
	//console.log("x: ", x);
	/*
	var def = new defer();
	var cursor = this.collection.find(query||{});

	cursor.toArray(function(err,docs){
		if (err){def.reject(err);return;}
		def.resolve(docs);
	});

	return def.promise;

	return new LazyArray({
		some: function(cb){
			cursor.each(function(err,doc){
				console.log("Got Next Object from Mongodb Cursor");
				if (cb){cb(doc);}
			});
		}
	});	
	*/
	var deferred = defer();
	// compose search conditions
	var meta = x[0], search = x[1];

	// range of non-positive length is trivially empty
	//if (options.limit > options.totalCount)
	//	options.limit = options.totalCount;
	if (meta.limit <= 0) {
		var results = [];
		results.totalCount = 0;
		return results;
	}

	console.log("Meta: ", meta);
	console.log("Search: ", search);
	// request full recordset length
//dir('RANGE', options, directives.limit);
	// N.B. due to collection.count doesn't respect meta.skip and meta.limit
	// we have to correct returned totalCount manually.
	// totalCount will be the minimum of unlimited query length and the limit itself
	var totalCountPromise = new defer();

	this.collection.count(search, function(err,totalCount){
		//console.log("totalCount: ", totalCount);
		totalCount -= meta.lastSkip;
		if (totalCount < 0)
			totalCount = 0;
		if (meta.lastLimit < totalCount)
			totalCount = meta.lastLimit;
		// N.B. just like in rql/js-array
		totalCountPromise.resolve(Math.min(totalCount, typeof meta.totalCount === "number" ? meta.totalCount : Infinity));
	})
//}

		// request filtered recordset
//console.log('QRY:', search, typeof search);
	
	this.collection.find(search, meta, function(err, cursor){
		if (err) return deferred.reject(err);
		cursor.toArray(function(err, results){
			if (err) return deferred.reject(err);
			// N.B. results here can be [{$err: 'err-message'}]
			// the only way I see to distinguish from quite valid result [{_id:..., $err: ...}] is to check for absense of _id
			if (results && results[0] && results[0].$err !== undefined && results[0]._id === undefined) {
				return deferred.reject(results[0].$err);
			}
			var fields = meta.fields;
			var len = results.length;
			// damn ObjectIDs!
			for (var i = 0; i < len; i++) {
				delete results[i]._id;
			}
			// kick out unneeded fields
			if (fields) {
				// unhash objects to arrays
				if (meta.unhash) {
					results = jsArray.executeQuery('values('+fields+')', opts, results);
				}
			}
			// total count
			when(totalCountPromise, function(result){
				//console.log("when totalCountPromise: ", results, result);
				results.count = results.length;
				results.start = meta.skip;
				results.end = meta.skip + results.count;
				results.schema = _self.schema.id; //schema;
				results.totalCount = result;
//dir('ESULTS:, results.slice(0,0));
				deferred.resolve(results);
			});
		});
	});
	return deferred;
}

Store.prototype.put= function(obj, options){
	var _self=this;
//	this.db.collection(this.id).update({id: obj.id || options.id},{$set: obj},{multi:false,upsert:true}, function(err){

	var def = new defer();

	console.log("MONGO STORE post()", obj);
	if (!obj.id || (obj.id && (options&&options.overwrite))) {
		obj.id = obj.id || ((options&&options.id)?options.id:randomstring.generate(10)); 

		obj = this.normalizeObject(obj);
/*
		this.collection.save(obj, {safe: true}, function(err,obj){
			console.log("Saved: ", obj);
			if (err) {def.reject(err); return;}
			def.resolve(obj);	
		});	
*/
		this.collection.findAndModify({id: obj.id},[],{$set: obj}, {safe:true,upsert:true,"new":true}, function(err,obj){
			console.log("Saved: ", obj);
			if (err) {def.reject(err); return;}
			def.resolve(obj);	
		});	
		return def.promise;
	}


	var upd = {};
	for (prop in obj){
		if (prop=="id"){continue;}
		var s = this.schema.properties[prop];
		if (!s && this.schema.allowAdditionalProperties){
			upd[prop]=obj[prop];
		}else{
			switch(s.type){
				case "date":

					if(obj[prop]!==undefined){ 
						if (obj[prop] instanceof Date){
							upd[prop] = obj[prop];
						}else if (typeof obj[prop] == "string"){
							upd[prop] = new Date(Date.parse(obj[prop]));
						}else if (typeof obj[prop]=="number"){
							upd[prop] = new Date(obj[prop]);
						}
					}
					break;
				case "array":
					if((obj[prop]!==undefined) && !obj[prop].forEach) { // !(obj[prop] instanceof Array)){
						throw Error("Invalid Type in property: ", prop," Should be: ", s.type, " but found ", typeof obj[prop]);
					}
					upd[prop]=obj[prop];
					break;
				default:
					if ((obj[prop]!==undefined) && (typeof obj[prop] != s.type)){
						throw Error("Invalid Type in property: ", prop," Should be: ", s.type, " but found ", typeof obj[prop]);
					}
					upd[prop]=obj[prop];
			}
//			upd[prop]=obj[prop];
		}
	}
	if (obj._id) { delete obj._id; }
	//console.log("MONGO UPDATE: ", obj.id, upd);
	this.collection.findAndModify({id: obj.id},[],{$set:upd},{multi:false,safe:true}, function(err, resp){
		//console.log("findAndModify Results: ", arguments);		
		if (err){
			//console.log("MONGO UPDATE ERROR: ", err);
			def.reject(err);
		}
		_self.get(obj.id).then(function(o){
			def.resolve(o);
		});
	});
	return def.promise;	
};

Store.prototype.normalizeObject= function(obj){
	//console.log("Normalize Obj: ", obj);
	if (obj._id) { delete obj._id; }
	var _self=this;
	var schema = this.schema;
	Object.keys(schema.properties).forEach(function(prop){
		var s = schema.properties[prop];
		//console.log(prop, "s: ",s.type, s);
		//console.log(prop, ": ", typeof obj[prop], typeof s.default);
		if (s.required){
			if ((typeof obj[prop]=='undefined') && (typeof s.default!='undefined')){
				//console.log("set to default: obj[prop]:",obj[prop], s['default']); 
				obj[prop]=s['default'];
			
			}else if (obj[prop]===undefined){
				throw Error("Missing required property: "+ prop);
			}
		}

		
		switch(s.type){
			case "date":
				//console.log("Inspecting Date Value: ");
				//console.log(prop, "Date Obj Val: ", obj[prop], "String?:", typeof obj[prop]=="string", "instanceOf Date: ", obj[prop] instanceof Date);

				if(obj[prop]!==undefined){ 
					if (obj[prop] instanceof Date){
						obj[prop] = obj[prop];//.toISOString();
					}else if (typeof obj[prop] == "string"){
						obj[prop] = new Date(Date.parse(obj[prop]));//.toISOString();
					}else if (typeof obj[prop]=="number"){
						obj[prop] = new Date(obj[prop]);//.toISOString();	
					}
				}
				break;
			case "array":
				if((obj[prop]!==undefined) && (obj[prop] instanceof Array)){
					obj[prop] = obj[prop];
				}
				break;
			default:
				if ((obj[prop]!==undefined) && (typeof obj[prop] != s.type)){
					throw Error("Invalid Type '" + s.type  + "' in property: " + prop + ". Should be: " + s.type + " but found " + typeof obj[prop]);
				}
		}
	});

	for (prop in obj){
		var op = obj[prop];
		var sp = this.schema.properties[prop];

		if ((!sp && !this.allowAdditionalProperties) || sp.transient){
			delete obj[prop];	
		}	
	}

	//console.log("Normalized Obj : ", obj);
	return obj;		
}

Store.prototype.post = function(obj, options){
	return this.put(obj,options)
};

Store.prototype.delete = function(id, options){
	var def = new defer();
	if (typeof id=="object"){
		id=id.id;
	}	
	this.collection.delete({id:id},{safe:true}, function(err, count){
		if (err) { def.reject(err); }
		def.resolve(count);
	});
	return def.promise;
}
