var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ArrayQuery = require("rql/js-array").query;
var LazyArray = require("promised-io/lazy-array").LazyArray;

var Store = exports.Store= function(id,options){
	this.id = id;
	this.opts = options;

	if (!options.send){
		console.log("Message Store requires a send() function to deliver messsages");
	}
	this.send = options.send;
}

util.inherits(Store, StoreBase);

Store.prototype.get = function(id,opts){
//	var o = this.trimOpts(opts);
//	var params = [id||opts.req.params.id,o];
//	var _self=this;
//	return this.send(this.id, "get", [id]); //{method: "get", params: params})
	return this.send(this.id, "get", id)

//	return when(this.send(this.id, {method: "get", params: [id,{}]}), function(results){
//		console.log("Schema:", _self.schema);
//		return results;
//	});
}

Store.prototype.trimOpts= function(opts){
	var o = {
		req: {},
		res: {}
	}

	if (opts && opts.req){
		o.req.headers = opts.req.headers	
		o.req.session = opts.req.session;
		o.req.sessionID = opts.req.sessionID;
		o.req.body = opts.req.body
		o.req.originalUrl= opts.req.originalUrl;
		o.req.url = opts.req.url;
		o.req.method=opts.req.method;
		if (opts.req.session && opts.req.session.passport){
			o.req.user = o.req.remoteUser = opts.req.session.passport.user;
		}
		o.req.parsedUrl = o.req._parsedUrl = opts.req._parsedUrl;
		o.req.query = opts.req.query || {};
//		o.req.query = o.req._parsedUrl.query;
//		o.req.range= opts.req.range;	
	}
//	console.log("Req: ", opts.req);
//	console.log("Trimmed Options: ", o);
	return o;
}
Store.prototype.query=function(query,opts){
//	var o = this.trimOpts(opts);
	//var params = [query || o.req.query,o];
	
//	return when(this.send(this.id, "query", [query]), function(results){   //{method: "query", params: params}), function(results){
	if ((query && typeof query != "string") || (!query&&opts && opts.req && opts.req.originalQuery)) {
		query = unescape(opts.req.originalQuery);
	}

	console.log("Message Store Query: ", query);
	if (opts && opts.req && opts.req.headers) {
		console.log("Query Headers: ", opts.req.headers);
	}

	query = escape(query);

	return when(this.send(this.id, "query", query), function(results){
//		console.log("Query Results: ", results);
		var end = results.start + results.count;

		if (opts && opts.req && opts.req.headers && opts.req.headers.range){ 
			var end = results.start + results.count;
//			console.log("opts res: ", opts);
			var r =  "items " + results.start + "-" + end + "/" + results.totalCount; 
//			console.log("R: ", r);
			opts.res.set("content-range",r);
		}
		return new LazyArray({
			some: function(cb){
				for (var i=0;i<results.count;i++){
					cb(results[i]);	
				}
			}
		});
	});
}

Store.prototype.post=function(obj,opts){
	//var o= this.trimOpts(opts);
	//var params = [obj||o.req.body,o];
	console.log("Message Store Post: ", obj);
	return this.send(this.id, "post", obj);//{method: "post", params: params});
}

Store.prototype.put=function(obj, opts){
//	var o= this.trimOpts(opts);
//	var params = [obj||o.req.body,o];
	return this.send(obj, "put", obj);
}

Store.prototype.delete=function(id, opts){
	return this.send(this.id, "delete", id); 
}
