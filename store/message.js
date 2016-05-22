var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ArrayQuery = require("rql/js-array").query;
var LazyArray = require("promised-io/lazy-array").LazyArray;
var declare = require("dojo-declare/declare");


var Store = exports.Store= declare([StoreBase], {
	
	init: function(){
		console.log("Message Store Init: ", this.id, this.options);
		if (!this.options || !this.options.send){
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
				query="";
			}else{
				query = unescape(opts.req.originalQuery);
			}
		}

//		if (opts && opts.req && opts.req.headers) {
//			console.log("** Query Headers: ", opts.req.headers);
//		}
		query = query?escape(query):"";

		if (opts && opts.req && opts.req.limit) {
			//console.log("message store req.limit: ", opts.req.limit);
		}

		//console.log('sending query FROM message store: ', query);
		//console.log("MessageSotre this.id: ", this.id);
                return when(this.send(this.id, "query", query), function(results){
                        //console.log("Message Store Query Results: ", results);
                        //console.log("Query Results Len: ", results.count, "count: ", results.count, "totalCount: ", results.totalCount);
                        //console.log("Result Keys: ", Object.keys(results).join(","));
                        var start = results.start || 0;
                        var end = start + results.count;

                        //if (opts && opts.req && opts.req.headers && opts.req.headers.range){ 
                        var r =  "items " + start + "-" + end + "/" + results.totalCount;
                        //console.log("content-range: ", r);
                        if (opts && opts.res) {
                                opts.res.set("content-range",r);
                        }
			//console.log("returning from store.query: ", results);
                        //return results.data;
                        return results.data || results;
                });
	},

	post: function(obj,opts){
		var safeOpts={};
		Object.keys(opts).forEach(function(key){
			if (key=="res") { return; }
			if (key=="req") { 
				safeOpts.req={}
				safeOpts.req.user = opts.req.user;
			}
			if (typeof opts[key] != "function") { safeOpts[key]=opts[key];}
		});
		return this.send(this.id, "post", [obj,safeOpts]);//{method: "post", params: params});
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
