var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ArrayQuery = require("rql/js-array").query;
var LazyArray = require("promised-io/lazy-array").LazyArray;
var declare = require("dojo-declare/declare");


var Store = exports.Store= declare([StoreBase], {
	init: function(id,options){
		if (!this.options.send){
			console.log("Message Store requires a send() function to deliver messsages");
		}
		this.send = this.options.send;
	},

	get: function(id,opts){
		return this.send(this.id, "get", id)

	},

	trimOpts: function(opts){
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
//			o.req.query = o.req._parsedUrl.query;
//			o.req.range= opts.req.range;	
		}
//		console.log("Req: ", opts.req);
//		console.log("Trimmed Options: ", o);
		return o;
	},

	query: function(query,opts){
		if ((query && typeof query != "string") || !query) {
			if (!opts && !opts.req && !opts.req.originalQuery){
				console.log("query issue opts.req: ", opts.req);
				query="";
			}else{
				query = unescape(opts.req.originalQuery);
			}
		}

		console.log("Message Store Query: ", query);
		if (opts && opts.req && opts.req.headers) {
			console.log("Query Headers: ", opts.req.headers);
		}
		query = query?escape(query):"";

		console.log('sending query: ', query);
		return when(this.send(this.id, "query", query), function(results){
			console.log("Query Results Len: ", results.length, "count: ", results.count);
			console.log("Result Keys: ", Object.keys(results).join(","));
			var end = results.start + results.count;
	
			if (opts && opts.req && opts.req.headers && opts.req.headers.range){ 
				var end = results.start + results.count;
				console.log("opts res: ", opts);
				var r =  "items " + results.start + "-" + end + "/" + results.totalCount; 
				console.log("R: ", r);
				opts.res.set("content-range",r);
			}
//			return results;
			return when(results, function(results){
				if (results instanceof Array){
					return results;
				}else if ((typeof results=="object")&&results.items){
					return results;
				}else{
					return new LazyArray({
						some: function(cb){
							for (var i=0;i<results.count;i++){
								cb(results[i]);	
							}
						}
					});
				}
			});

		});
	},

	post: function(obj,opts){
		console.log("Message Store Post: ", obj);
		return this.send(this.id, "post", obj);//{method: "post", params: params});
	},

	put:function(obj, opts){
	//	var o= this.trimOpts(opts);
	//	var params = [obj||o.req.body,o];
		return this.send(obj, "put", obj);
	},

	"delete": function(id, opts){
		return this.send(this.id, "delete", id); 
	}
});
