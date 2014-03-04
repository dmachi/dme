var solr = require("solr-client");
var Deferred = require("promised-io/promise").defer;
var All= require("promised-io/promise").all;
var Sequence= require("promised-io/promise").seq;
var Query = require("rql/query").Query;
var LazyArray = require("promised-io/lazy-array").LazyArray;
var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var declare = require("dojo-declare/declare");

var handlers = [
	["and", function(query, options){
		var parts=[]
		query.args.forEach(function(a){
			var p = walkQuery(a,options);
			if (p){
				parts.push(p);
			}
		});
		parts = parts.filter(function(p){
			return !!p;
		});
		return "(" + parts.join(" AND ") + ")"
	}],	

	["or", function(query, options){
		var parts=[]
		query.args.forEach(function(a){
			parts.push(walkQuery(a,options));
		});

		parts = parts.filter(function(p){
			return !!p;
		});
	
		return "(" + parts.join(" OR ") + ")";
	}],

	["eq", function(query, options){
		var parts = [query.args[0]]
		//console.log("eq query", query);
		//console.log("Checking for match: ", query.args[1]);
		parts.push(walkQuery(query.args[1],options));
		return parts.join(":");

//		return query.args.join(":");
	}],
	["ne", function(query, options){
		var parts = [query.args[0]]
		//console.log("eq query", query);
		//console.log("Checking for match: ", query.args[1]);
		parts.push(walkQuery(query.args[1],options));
		return "-" + parts.join(":");

//		return query.args.join(":");
	}],
	
	["exists", function(query, options){
		return "-" + query.args[0] + ":[* TO *]";
	}],

	["match", function(query, options){
		return query.args.join(":/")+"/";
	}],
	["ge", function(query, options){
		return query.args[0] + ":{" + query.args[1] + " TO *}";
	}],
	["gt", function(query, options){
		return query.args[0] + ":[" + query.args[1] + " TO *]";
	}],
	["le", function(query, options){
		return query.args[0] + ":{* TO " + query.args[1] + "}";
	}],
	["lt", function(query, options){
		return query.args[0] + ":[* TO " + query.args[1] + "]";
	}],

	["between", function(query, options){
		return query.args[0] + ":[" + queyr.args[1] + " TO " + query.args[2] + "]";
	}],

	["field", function(query, options){
		return "(_val_:" + query.args[0] + ")";
	}],

	["qf", function(query, options){
		if (!options.qf){options.qf=[]}
		options.qf.push(walkQuery(query.args[0],options));
	}],

	["fq", function(query, options){
		if (!options.fq){options.fq=[]}
		options.fq.push(walkQuery(query.args[0],options));
	}],

	["not", function(query, options){
		return "NOT " + walkQuery(query.args[0],options);
	}],



	["in", function(query, options){
		//console.log("IN ", query.args[0], query.args[1]);
		return "(" + query.args[0] + ":(" + query.args[1].join(" OR ") + "))";
	}],

	["keyword", function(query,options){
		return query.args[0];
	}],

	["query", function(query, options){
		var queries = query.args.slice(1);
		var q = queries.map(function(qp){
			console.log("qp: ", qp);
			return Query(qp).toString();
		});
		var modelId = query.args[0];
		if (!options.queries){
			options.queries=[];
		}

		//console.log("query(q): ", q);
		options.queries.push([modelId,q.join("&")]);
		return;
	}],

	["distinct", function(query, options){
		if (!options.distinct){
			options.distinct=[]
		}

		options.distinct.push(query.args);
	}],


	["facet", function(query, options){
		//var parts = ["facets=true"];
//		query.args[0].forEach(function(field){
//				parts.push("facet.field=" + field);
//		});
//		parts.push("sort=" + query.args[1]);
		if (!options.facets){
			options.facets=[];
		}	

		function existingFacetProps(tprop){
			for (i=0; i < options.facets.length; ++i){
				if (options.facets[i]['field'] == tprop){
					return true;
				}
			}
			return false;
		}
		query.args.forEach(function(facet){
			var facetProp = facet[0];
			var facetVal = facet[1];

			console.log("facet[1]: ", facetVal);
			if (facetProp == "sort"){
				var dir =  (facetVal.charAt(0)=="+")?"ASC":"DESC";
				facetVal = facetVal.substr(1) + " " + dir;
		
			}
			if (facetVal instanceof Array){
				facetVal = facetVal.join(",");
			}	
			var f = {field: facetProp,value: facetVal}
			console.log("f: ", f);
			options.facets.push(f);
		});
		if (!existingFacetProps('mincount')){
			options.facets.push({field: "mincount", value: 1});
		}
		if (!existingFacetProps('limit')){
			options.facets.push({field: "limit", value: 500});
		}
	}],

	["cursor", function(query,options){
		return;
		
	}],
	["values", function(query, options){
		/*
		if (query.args[1] && (typeof query.args[1]=='object')){
			var objs =query.args[1].map(function(item){
				if ((typeof query.args[0]=='object') && query.args[0].length>1){
					var obj=[];
					query.args[0].forEach(function(prop){
						obj.push(item[prop]);
					});
				}else{
					if (item[query.args[0]]){ return item[query.args[0]]; }
				}
			})
			return "(" + objs.join(",") + ")"
		}
		*/
		options.values = query.args[0];
		return;
	}],

	["select", function(query, options){
		return;
	}],
	["sort", function(query, options){
		return;
	}],
	["limit", function(query, options){
		return;
	}],

	["debugPost", function(item){
		console.log(arguments);
		return item;
	},"post"]
]
/*
Query.prototype.normalize = function(options){
	options = options || {};
	options.primaryKey = options.primaryKey || 'id';
	options.map = options.map || {};
	var result = {
		original: this,
		sort: [],
		limit: [10, 0, 9999999],
		skip: 0,
		select: this.defaultSelectFields || [],
		values: false
	};
	var plusMinus = {
		// [plus, minus]
		sort: [1, -1],
		select: [1, 0]
	};
	function normal(func, args, depth){
		// cache some parameters
		if (func === 'sort' || func === 'select') {
			if (depth<1){
				result[func] = args;
				var pm = plusMinus[func];
				result[func+'Arr'] = result[func].map(function(x){
					if (x instanceof Array) x = x.join('.');
					var o = {};
					var a = /([-+]*)(.+)/.exec(x);
					o[a[2]] = pm[(a[1].charAt(0) === '-')*1];
					return o;
				});
				result[func+'Obj'] = {};
				result[func].forEach(function(x){
					if (x instanceof Array) x = x.join('.');
					var a = /([-+]*)(.+)/.exec(x);
					result[func+'Obj'][a[2]] = pm[(a[1].charAt(0) === '-')*1];
				});
			}
		} else if (func === 'limit') {
			// validate limit() args to be numbers, with sane defaults
			//console.log("Limit found at depth: ", depth);
			console.log("Found Limit Func", args);
//			if (depth<1){
				var limit = args;
				result.skip = +limit[1] || 0;
				limit = +limit[0] || 0;
				if (options.hardLimit && limit > options.hardLimit)
					limit = options.hardLimit;
				result.limit = limit;
				console.log("result.limit: ", result.limit, result);
				result.needCount = true;
//			}
		} else if (func === 'values') {
			if (depth<1){
				// N.B. values() just signals we want array of what we select()
				result.values = true;
			}
		} else if (func === 'eq') {
			// cache primary key equality -- useful to distinguish between .get(id) and .query(query)
			var t = typeof args[1];
			//if ((args[0] instanceof Array ? args[0][args[0].length-1] : args[0]) === options.primaryKey && ['string','number'].indexOf(t) >= 0) {
			console.log("eq() args: ", args);
			if (args[0] === options.primaryKey && ['string','number'].indexOf(t) >= 0) {
				result.pk = String(args[1]);
			}
		}
		// cache search conditions
		//if (options.known[func])
		// map some functions
		//if (options.map[func]) {
		//	func = options.map[func];
		//}
	}
	this.walk(normal);
	return result;
};
*/

/*
Query.prototype.walk = function(fn, options){
	options = options || {};
	var depth; 
	function walk(name, terms,depth){
		if (typeof depth=='undefined') { 
			depth=0; 
		}else{
			depth++;
		}
		(terms || []).forEach(function(term, i, arr) {
			var args, func, key, x;
			term != null ? term : term = {};
			func = term.name;
			args = term.args;
			if (!func || !args) {
				return;
			}
			if (args[0] instanceof Query) {
				walk.call(this, func, args,depth);
			} else {
				var newTerm = fn.call(this, func, args, depth);
				if (newTerm && newTerm.name && newTerm.args)
					arr[i] = newTerm;
			}
		});
	}
	walk.call(this, this.name, this.args,depth);
};
*/

Query.prototype.toSolr = function(SolrQuery,options){
	options = options || {};

	options.handlers = options.handlers || handlers;
	var known = options.handlers.map(function(h){
		return h[0];
	});

	var query = this.normalize({
		known: known
	});

	console.log("query: ", query);

	var processedQ = walkQuery(query.original, options);

	if (!processedQ||processedQ=="()"){ processedQ = "*:*" };
	console.log("processedQ: ", processedQ);

	if (options.qf){
		processedQ += "&qf="+options.qf;
	}
	var q = SolrQuery.q(processedQ||"*:*") ;

	if (options.fq){
		options.fq.forEach(function(fq){
			q.set("fq=" + fq);
		});
	}	

	

	console.log("SolrQuery: ", q);
	
	if (query && query.sortObj){
		var so = {}
		for (prop in query.sortObj){
			so[prop] = (query.sortObj[prop]>0)?"asc":"desc";
		}
		q.sort(so);
	}
	
	console.log("Query Limit: ", query.limit);
	if (query && typeof query.limit != 'undefined' && query.limit!=Infinity){
		if (typeof query.limit=='number'){
			q.rows(query.limit);
		}else{
			q.rows(query.limit[0]);
		}
	}else{
		q.rows(1000);
	}

	if (query && (query.skip||(query.limit && query.limit[1]))){
		q.start(query.skip||query.limit[1])
	}

	if (options.facets){
		options.facets.forEach(function(f){
			q.parameters.push("facet=true");
			console.log("Param: ", "facet." + f.field + "=" + encodeURIComponent(f.value));
			q.parameters.push("facet." + f.field + "=" + encodeURIComponent(f.value));
//			q.facet(f);
		});
	}	
	if (options.bf){
		options.bf.forEach(function(bf){
		//	q.bf(bf);
			q.parameters.push('_query_:"' + bf + '"');
		});
	}
	
	return q;
}

var walkQuery=function(query,options){
	//console.log("Query: ",query);
	var handler;
		
	if (options.handlers.some(function(h){
		if (h&&h[0]==query.name){
			//console.log("found Handler: ", h[0]);
			handler=h;
			return true;
		}
	})){

		if (handler[2] && handler[2]=="post"){
			//console.log("Adding POST Handler: ", handler[0]);
			if (!options.post){
				options.post=[];
			}
			options.post.push(handler);
			return;
		}else{
			return handler[1](query, options);
		}
	} 

//	throw Error("Unknown Query Operator: " + query.name);
	//console.log("wq :", query);
	return query;

}

var Store = exports.Store = declare([StoreBase], {
	authConfigProperty: "solr",
	primaryKey: "id",
	init: function(){
		if (!this.options.auth) { console.log("SOLR Auth Information Not Found"); }	

		this.client= solr.createClient(this.options.auth.host,this.options.auth.port,this.id, this.options.auth.path);

		if (this.options && this.options.queryHandlers){
			this._handlers = this.options.queryHandlers.concat(handlers);
		}

	},
	query: function(query, opts){
//		console.log("Store Options: ", this.options);
		var _self=this;
		var def = new defer();
		console.log("SOLR QUERY: ", query);
		q = Query(query);
		console.log("PARSED SOLR QUERY: ", q);
		var rqlOptions = {
			handlers: this._handlers,
			post: []
		}

		var squery = q.toSolr(_self.client.createQuery(), rqlOptions);

		console.log("SOLR QUERY: ",squery);
		_self.client.search(squery, function(err, obj){
			if (err){
				console.log("SOLR Error Response: ", err);
				return def.reject(err);
			}else{
				//console.log("obj: ", obj);
				if (obj && obj.response && obj.response.docs  && obj.response.docs instanceof Array ){// && obj.response && obj.response.docs){

				var qp = q.normalize();
				var distinctMap={};
				var responseItems = obj.response.docs;

				if (rqlOptions.facetValues && rqlOptions.facetValues.length>0){
//					console.log("Retrieving Facet Values: ", rqlOptions.facetValues);
					if (obj.facet_counts){
						var ff = obj.facet_counts.facet_fields;
						if (!ff){ throw Error("Facet Fields Not Found in results"); }
							var fo= [] 
							rqlOptions.facetValues.forEach(function(fv){
							//	console.log("fv: ", fv);
//								console.log("ff[fv]: ", ff[fv]);	
								if (ff[fv]){
									var keys = ff[fv].forEach(function(obj,index){
//										console.log("Filtering: ", obj, x, ((x%2)==0));	
										if ((index % 2) == 0){
											fo.push({
												key: obj,
												count: ff[fv][index+1]
											});
										}
									});
								//	console.log("keys: ", keys);
									fo = fo.concat(keys);
								}
							});

//							def.resolve(fo);
							responseItems = fo;
//							console.log("ResponseItems:", responseItems, fo);
//							def.resolve(fo);
		
						}else{
							throw new Error ("Facet Field Values could not be retrieved");
						}
					}

					var items = responseItems.map(function(item){
						//console.log("item: ", item);
						if(item && typeof item === "object"){
							var object = {};
							if (rqlOptions.distinct){
								if (rqlOptions.distinct.some(function(field){
									if (!(distinctMap[field])){
										distinctMap[field]={};
									}
									if(distinctMap[field][item[field]]){	
										return true;	
									}

									distinctMap[field][item[field]]=true;	
									return false;
								})){
									return null;
								}
							}
							if (rqlOptions.values){
								if(typeof rqlOptions.values=='string'){
									object = item[rqlOptions.values];
								}else if(rqlOptions.values.length==1){
									object = item[rqlOptions.values[0]];
								}else{
									object = rqlOptions.values.map(function(v){
										return item[v];
									});
								}
									
							}else if (qp && qp.select && qp.select.length>0){
								qp.select.forEach(function(prop){
									object[prop]=(typeof item[prop]!='undefined')?item[prop]:undefined;
								});
							}else{

								for(var i in item){
									if(item.hasOwnProperty(i)){
										object[i] = item[i];
									}
								}

							}

							rqlOptions.post.forEach(function(h){
								object = h[1](object);
							});	
						}
						return object;
					}).filter(function(o){return !!o});
					
					if (obj.facet_counts){
						var facets = obj.facet_counts;

						if (!items || items.length<1){ 
							
							return def.resolve({totalRows: obj.response.numFound, facets: facets});
						}

						return def.resolve({totalRows: obj.response.numFound, items: items, facets: facets});
					}
					if (opts && opts.res) {
						opts.res.totalCount = obj.response.numFound;
						console.log("opts.res: ", opts.res.totalCount);
					}
					def.resolve(items);
				}
			}
		});
		return def.promise;
	},

	get: function(id, opts){
			var def = new Deferred();
			var _self = this;	
			console.log("GET: ", id, opts);	
			var pk = this.options.primaryKey||this.options.primaryKey;

			if (!pk.map){
				pk=[pk];
			}

			var qs = pk.map(function(k){
				return "eq(" + k + "," + id + ")";
			}).join(",");

			
			//console.log("this.id: ", this);
			qs = "or(" + qs + ")&limit(1)";
			//console.log("qs: ", qs);
			var q = Query(qs).toSolr(_self.client.createQuery(),{handlers:this._handlers});

			_self.client.search(q, function(err, obj){
				if (err){
					def.reject(err);
				}else{
					if (obj && obj.response && obj.response.docs){
						return def.resolve(obj.response.docs[0]);
					}
					def.reject()
				}
			});
			return def.promise;
	}
});
	

